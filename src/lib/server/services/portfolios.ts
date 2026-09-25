import { and, asc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { slugify } from '$lib/schemas';
import { db } from '../db';
import {
	corporateActions,
	marketSessions,
	portfolios,
	priceBars,
	rebalancePositions,
	rebalances,
	strategies
} from '../db/schema';
import { closeAt, closeTime, effectiveDateFor } from '../market/calendar';
import { diffOrders } from '../portfolio/trades';
import type { CorporateAction, Order, Position } from '../portfolio/types';
import {
	valuePortfolio,
	type Holding,
	type Metrics,
	type SeriesPoint
} from '../portfolio/valuation';
import { ServiceError } from './errors';
import { findStrategy } from './strategies';
import { validateTickers } from './tickers';

export type Portfolio = typeof portfolios.$inferSelect;

export interface PortfolioInput {
	name: string;
	slug: string;
	description: string;
}

interface StrategyRef {
	slug: string;
	name: string;
}

export interface PendingRebalance {
	id: number;
	effectiveDate: string;
	/** UTC instant of the close the rebalance fills at. */
	closesAt: string;
	/** New York local close time, `16:00` or `13:00`. */
	closeTimeEt: string;
	/** `open` until the close; then `awaiting_prices` until closing prices are fetched. */
	state: 'open' | 'awaiting_prices';
	submittedAt: string;
	rationale: string | null;
	strategy: StrategyRef | null;
	positions: Position[];
	orders: Order[];
}

export interface ExecutedOrder extends Order {
	price: number | null;
}

export interface ExecutedRebalanceView {
	id: number;
	effectiveDate: string;
	submittedAt: string;
	rationale: string | null;
	strategy: StrategyRef | null;
	positions: Position[];
	orders: ExecutedOrder[];
}

export interface PortfolioView {
	portfolio: Portfolio;
	metrics: Metrics;
	holdings: Holding[];
	series: SeriesPoint[];
	pending: PendingRebalance[];
	history: ExecutedRebalanceView[];
	unpriced: string[];
}

export interface PortfolioSummary {
	portfolio: Portfolio;
	metrics: Metrics;
	positions: number;
	pending: PendingRebalance[];
}

export function listPortfolioRows(): Promise<Portfolio[]> {
	return db.select().from(portfolios).orderBy(asc(portfolios.name));
}

/** Finds a portfolio by slug or, failing that, by exact case-insensitive name. */
export async function findPortfolio(ref: string): Promise<Portfolio | null> {
	const slug = ref.trim().toLowerCase();
	const rows = await db
		.select()
		.from(portfolios)
		.where(or(eq(portfolios.slug, slug), sql`lower(${portfolios.name}) = lower(${ref.trim()})`));
	return rows.find((p) => p.slug === slug) ?? rows[0] ?? null;
}

export async function getPortfolio(ref: string): Promise<Portfolio> {
	const portfolio = await findPortfolio(ref);
	if (!portfolio) throw new ServiceError(`Portfolio "${ref}" does not exist.`, 404);
	return portfolio;
}

async function assertSlugFree(slug: string, exceptId?: number): Promise<void> {
	const [existing] = await db.select().from(portfolios).where(eq(portfolios.slug, slug));
	if (existing && existing.id !== exceptId) {
		throw new ServiceError(`A portfolio with the slug "${slug}" already exists.`, 409);
	}
}

function resolveSlug(input: PortfolioInput): string {
	const slug = input.slug || slugify(input.name);
	if (!slug) throw new ServiceError('Choose a slug with at least one letter or number.');
	return slug;
}

export async function createPortfolio(input: PortfolioInput): Promise<Portfolio> {
	const slug = resolveSlug(input);
	await assertSlugFree(slug);
	const [created] = await db
		.insert(portfolios)
		.values({ name: input.name, slug, description: input.description })
		.returning();
	return created;
}

export async function updatePortfolio(id: number, input: PortfolioInput): Promise<Portfolio> {
	const slug = resolveSlug(input);
	await assertSlugFree(slug, id);
	const [updated] = await db
		.update(portfolios)
		.set({ name: input.name, slug, description: input.description })
		.where(eq(portfolios.id, id))
		.returning();
	if (!updated) throw new ServiceError('Portfolio not found.', 404);
	return updated;
}

export async function deletePortfolio(id: number): Promise<void> {
	await db.delete(portfolios).where(eq(portfolios.id, id));
}

type RebalanceRow = {
	id: number;
	effectiveDate: string;
	submittedAt: Date;
	status: 'pending' | 'executed';
	rationale: string | null;
	strategy: StrategyRef | null;
	positions: Position[];
};

async function loadRebalances(portfolioIds: number[]): Promise<Map<number, RebalanceRow[]>> {
	const byPortfolio = new Map<number, RebalanceRow[]>(portfolioIds.map((id) => [id, []]));
	if (!portfolioIds.length) return byPortfolio;

	const rows = await db
		.select({
			id: rebalances.id,
			portfolioId: rebalances.portfolioId,
			effectiveDate: rebalances.effectiveDate,
			submittedAt: rebalances.submittedAt,
			status: rebalances.status,
			rationale: rebalances.rationale,
			strategySlug: strategies.slug,
			strategyName: strategies.name
		})
		.from(rebalances)
		.leftJoin(strategies, eq(strategies.id, rebalances.strategyId))
		.where(inArray(rebalances.portfolioId, portfolioIds))
		.orderBy(asc(rebalances.effectiveDate));
	const positions = rows.length
		? await db
				.select()
				.from(rebalancePositions)
				.where(
					inArray(
						rebalancePositions.rebalanceId,
						rows.map((r) => r.id)
					)
				)
				.orderBy(asc(rebalancePositions.ticker))
		: [];

	for (const row of rows) {
		byPortfolio.get(row.portfolioId)!.push({
			id: row.id,
			effectiveDate: row.effectiveDate,
			submittedAt: row.submittedAt,
			status: row.status,
			rationale: row.rationale,
			strategy:
				row.strategySlug && row.strategyName
					? { slug: row.strategySlug, name: row.strategyName }
					: null,
			positions: positions
				.filter((p) => p.rebalanceId === row.id)
				.map((p) => ({ ticker: p.ticker, side: p.side, shares: p.shares }))
		});
	}
	return byPortfolio;
}

interface MarketData {
	sessions: string[];
	bars: Map<string, Map<string, number>>;
	actions: CorporateAction[];
}

async function loadMarketData(tickers: string[], from: string | undefined): Promise<MarketData> {
	if (!from || !tickers.length) return { sessions: [], bars: new Map(), actions: [] };
	const [sessionRows, barRows, actionRows] = await Promise.all([
		db
			.select({ date: marketSessions.date })
			.from(marketSessions)
			.where(and(eq(marketSessions.hadData, true), gte(marketSessions.date, from)))
			.orderBy(asc(marketSessions.date)),
		db
			.select()
			.from(priceBars)
			.where(and(inArray(priceBars.ticker, tickers), gte(priceBars.date, from))),
		db
			.select()
			.from(corporateActions)
			.where(and(inArray(corporateActions.ticker, tickers), gte(corporateActions.date, from)))
	]);
	const bars = new Map<string, Map<string, number>>();
	for (const bar of barRows) {
		if (!bars.has(bar.ticker)) bars.set(bar.ticker, new Map());
		bars.get(bar.ticker)!.set(bar.date, bar.close);
	}
	return { sessions: sessionRows.map((s) => s.date), bars, actions: actionRows };
}

function buildView(
	portfolio: Portfolio,
	rows: RebalanceRow[],
	market: MarketData,
	now: Date
): PortfolioView {
	const executed = rows.filter((r) => r.status === 'executed');
	const valuation = valuePortfolio({
		rebalances: executed,
		bars: market.bars,
		actions: market.actions,
		sessions: market.sessions
	});

	let base: Position[] = valuation.holdings.map((h) => ({
		ticker: h.ticker,
		side: h.side,
		shares: h.shares
	}));
	const pending: PendingRebalance[] = rows
		.filter((r) => r.status === 'pending')
		.map((r) => {
			const orders = diffOrders(base, r.positions);
			base = r.positions;
			const closesAt = closeAt(r.effectiveDate);
			return {
				id: r.id,
				effectiveDate: r.effectiveDate,
				closesAt: closesAt.toISOString(),
				closeTimeEt: closeTime(r.effectiveDate),
				state: now < closesAt ? 'open' : 'awaiting_prices',
				submittedAt: r.submittedAt.toISOString(),
				rationale: r.rationale,
				strategy: r.strategy,
				positions: r.positions,
				orders
			};
		});

	const history: ExecutedRebalanceView[] = executed
		.map((r) => ({
			id: r.id,
			effectiveDate: r.effectiveDate,
			submittedAt: r.submittedAt.toISOString(),
			rationale: r.rationale,
			strategy: r.strategy,
			positions: r.positions,
			orders: (valuation.orders.get(r.id) ?? []).map((o) => ({
				...o,
				price: valuation.fills.get(r.id)?.get(o.ticker) ?? null
			}))
		}))
		.reverse();

	return {
		portfolio,
		metrics: valuation.metrics,
		holdings: valuation.holdings,
		series: valuation.series,
		pending,
		history,
		unpriced: valuation.unpriced
	};
}

async function loadViews(list: Portfolio[], now: Date): Promise<PortfolioView[]> {
	const rowsByPortfolio = await loadRebalances(list.map((p) => p.id));
	const executed = [...rowsByPortfolio.values()].flat().filter((r) => r.status === 'executed');
	const tickers = [...new Set(executed.flatMap((r) => r.positions.map((p) => p.ticker)))];
	const from = executed.map((r) => r.effectiveDate).sort()[0];
	const market = await loadMarketData(tickers, from);
	return list.map((p) => buildView(p, rowsByPortfolio.get(p.id) ?? [], market, now));
}

export async function getPortfolioView(ref: string, now = new Date()): Promise<PortfolioView> {
	const [view] = await loadViews([await getPortfolio(ref)], now);
	return view;
}

export async function listPortfolioSummaries(now = new Date()): Promise<PortfolioSummary[]> {
	const views = await loadViews(await listPortfolioRows(), now);
	return views.map((v) => ({
		portfolio: v.portfolio,
		metrics: v.metrics,
		positions: v.holdings.length,
		pending: v.pending
	}));
}

export interface SubmitInput {
	portfolio: string;
	positions: Position[];
	rationale?: string | null;
	strategy?: string | null;
}

/**
 * Records a complete target portfolio that fills at the first close after `now`. It replaces a
 * pending submission for the same close; a pending rebalance whose close already passed is kept.
 */
export async function submitPortfolio(
	input: SubmitInput,
	now = new Date()
): Promise<PendingRebalance> {
	const portfolio = await getPortfolio(input.portfolio);

	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const p of input.positions) (seen.has(p.ticker) ? duplicates : seen).add(p.ticker);
	if (duplicates.size) {
		throw new ServiceError(
			`Each ticker may appear once. Duplicates: ${[...duplicates].join(', ')}.`
		);
	}

	const checks = await validateTickers([...seen], now);
	const invalid = checks.filter((c) => !c.valid);
	if (invalid.length) {
		throw new ServiceError(
			`Invalid tickers: ${invalid.map((c) => `${c.ticker} (${c.reason})`).join(', ')}`
		);
	}

	let strategyId: number | null = null;
	if (input.strategy) {
		const strategy = await findStrategy(input.strategy);
		if (!strategy) throw new ServiceError(`Strategy "${input.strategy}" does not exist.`, 404);
		strategyId = strategy.id;
	}

	const effectiveDate = effectiveDateFor(now);
	const id = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(1, ${portfolio.id})`);
		await tx
			.delete(rebalances)
			.where(
				and(
					eq(rebalances.portfolioId, portfolio.id),
					eq(rebalances.effectiveDate, effectiveDate),
					eq(rebalances.status, 'pending')
				)
			);
		const [created] = await tx
			.insert(rebalances)
			.values({
				portfolioId: portfolio.id,
				submittedAt: now,
				effectiveDate,
				rationale: input.rationale?.trim() || null,
				strategyId
			})
			.returning({ id: rebalances.id });
		if (input.positions.length) {
			await tx
				.insert(rebalancePositions)
				.values(input.positions.map((p) => ({ ...p, rebalanceId: created.id })));
		}
		return created.id;
	});

	const view = await getPortfolioView(portfolio.slug, now);
	return view.pending.find((p) => p.id === id)!;
}

/** Deletes a pending rebalance whose close has not happened yet. */
export async function cancelPendingRebalance(
	portfolioId: number,
	rebalanceId: number,
	now = new Date()
): Promise<void> {
	const [row] = await db
		.select()
		.from(rebalances)
		.where(and(eq(rebalances.id, rebalanceId), eq(rebalances.portfolioId, portfolioId)));
	if (!row || row.status !== 'pending') throw new ServiceError('No such pending rebalance.', 404);
	if (now >= closeAt(row.effectiveDate)) {
		throw new ServiceError(
			'The close already happened; this rebalance can no longer be cancelled.',
			409
		);
	}
	await db.delete(rebalances).where(eq(rebalances.id, rebalanceId));
}
