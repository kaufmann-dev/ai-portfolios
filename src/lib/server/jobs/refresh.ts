/**
 * Fetches closing prices and corporate actions for every tracked ticker, one trading session at a
 * time, then marks pending rebalances whose close now has prices as executed. Idempotent.
 */
import { and, eq, inArray, lte, min, sql } from 'drizzle-orm';
import { db } from '../db';
import {
	corporateActions,
	marketSessions,
	priceBars,
	rebalancePositions,
	rebalances
} from '../db/schema';
import {
	closeAt,
	lastCompletedSession,
	nextTradingDay,
	tradingDaysBetween
} from '../market/calendar';
import {
	fetchDividends,
	fetchGroupedCloses,
	fetchSplits,
	fetchTickerClose,
	MassiveError
} from '../massive/client';

/** Massive's daily bars settle shortly after the close. */
const SETTLE_MS = 30 * 60_000;
/** A scheduled session still without data this long after its close was an unscheduled closure. */
const CLOSURE_MS = 36 * 3_600_000;

let running: Promise<void> | null = null;

export function refreshMarketData(now = new Date()): Promise<void> {
	running ??= run(now).finally(() => {
		running = null;
	});
	return running;
}

async function run(now: Date): Promise<void> {
	try {
		await fetchMissingSessions(now);
		await markExecuted(now);
	} catch (error) {
		if (error instanceof MassiveError && error.transient) {
			console.warn(`[refresh] deferred: ${error.message}`);
			return;
		}
		console.error('[refresh] failed', error);
	}
}

async function fetchMissingSessions(now: Date): Promise<void> {
	const [{ first }] = await db.select({ first: min(rebalances.effectiveDate) }).from(rebalances);
	if (!first) return;

	const last = lastCompletedSession(now);
	if (first > last) return;
	const fetched = new Set(
		(await db.select({ date: marketSessions.date }).from(marketSessions)).map((s) => s.date)
	);

	for (const date of tradingDaysBetween(first, last)) {
		if (fetched.has(date)) continue;
		const sinceClose = now.getTime() - closeAt(date).getTime();
		if (sinceClose < SETTLE_MS) break;

		const closes = await fetchGroupedCloses(date);
		if (closes.size === 0) {
			if (sinceClose < CLOSURE_MS) break; // Not published yet; sessions must be stored in order.
			await recordClosure(date);
			continue;
		}
		await storeSession(date, closes);
	}
}

async function trackedTickers(date: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ ticker: rebalancePositions.ticker })
		.from(rebalancePositions)
		.innerJoin(rebalances, eq(rebalances.id, rebalancePositions.rebalanceId))
		.where(lte(rebalances.effectiveDate, date));
	return rows.map((r) => r.ticker);
}

async function storeSession(date: string, closes: Map<string, number>): Promise<void> {
	const tickers = await trackedTickers(date);
	const tracked = new Set(tickers);
	const [splits, dividends] = await Promise.all([fetchSplits(date), fetchDividends(date)]);

	const bars: { ticker: string; date: string; close: number }[] = [];
	for (const ticker of tickers) {
		let close = closes.get(ticker) ?? null;
		if (close === null) {
			try {
				close = await fetchTickerClose(ticker, date);
			} catch (error) {
				if (error instanceof MassiveError && error.transient) throw error;
			}
		}
		if (close !== null) bars.push({ ticker, date, close });
	}

	const splitByTicker = new Map<string, { splitFrom: number; splitTo: number }>();
	for (const s of splits.filter((s) => tracked.has(s.ticker))) {
		const prior = splitByTicker.get(s.ticker) ?? { splitFrom: 1, splitTo: 1 };
		splitByTicker.set(s.ticker, {
			splitFrom: prior.splitFrom * s.splitFrom,
			splitTo: prior.splitTo * s.splitTo
		});
	}
	const cashByTicker = new Map<string, number>();
	for (const d of dividends.filter((d) => tracked.has(d.ticker))) {
		cashByTicker.set(d.ticker, (cashByTicker.get(d.ticker) ?? 0) + d.cashAmount);
	}
	const actions = [
		...[...splitByTicker].map(([ticker, s]) => ({
			ticker,
			date,
			kind: 'split' as const,
			splitFrom: s.splitFrom,
			splitTo: s.splitTo,
			cashAmount: null
		})),
		...[...cashByTicker].map(([ticker, cashAmount]) => ({
			ticker,
			date,
			kind: 'dividend' as const,
			splitFrom: null,
			splitTo: null,
			cashAmount
		}))
	];

	await db.transaction(async (tx) => {
		if (bars.length) {
			await tx
				.insert(priceBars)
				.values(bars)
				.onConflictDoUpdate({
					target: [priceBars.ticker, priceBars.date],
					set: { close: sql`excluded.close` }
				});
		}
		if (actions.length) await tx.insert(corporateActions).values(actions).onConflictDoNothing();
		await tx.insert(marketSessions).values({ date, hadData: true }).onConflictDoNothing();
	});
	console.info(
		`[refresh] stored ${date}: ${bars.length} closes, ${actions.length} corporate actions`
	);
}

/** Moves rebalances from an unscheduled market closure to the next session. */
async function recordClosure(date: string): Promise<void> {
	const next = nextTradingDay(date);
	await db.transaction(async (tx) => {
		const stranded = await tx
			.select({ id: rebalances.id, portfolioId: rebalances.portfolioId })
			.from(rebalances)
			.where(and(eq(rebalances.effectiveDate, date), eq(rebalances.status, 'pending')));
		for (const r of stranded) {
			const [newer] = await tx
				.select({ id: rebalances.id })
				.from(rebalances)
				.where(and(eq(rebalances.portfolioId, r.portfolioId), eq(rebalances.effectiveDate, next)));
			if (newer) {
				await tx.delete(rebalances).where(eq(rebalances.id, r.id));
			} else {
				await tx.update(rebalances).set({ effectiveDate: next }).where(eq(rebalances.id, r.id));
			}
		}
		await tx.insert(marketSessions).values({ date, hadData: false }).onConflictDoNothing();
	});
	console.warn(`[refresh] no market data for ${date}; treated as a closure`);
}

async function markExecuted(now: Date): Promise<void> {
	const priced = db
		.select({ date: marketSessions.date })
		.from(marketSessions)
		.where(eq(marketSessions.hadData, true));
	await db
		.update(rebalances)
		.set({ status: 'executed', executedAt: now })
		.where(and(eq(rebalances.status, 'pending'), inArray(rebalances.effectiveDate, priced)));
}
