import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { TOOL_SCOPES } from './scopes';
import { z } from 'zod';
import { positionSchema, strategySchema, TICKER_PATTERN } from '#lib/schemas.js';
import { ServiceError } from '../services/errors';
import {
	createPortfolio,
	getPortfolioView,
	listPortfolioSummaries,
	submitPortfolio,
	type PortfolioView
} from '../services/portfolios';
import {
	createStrategy,
	getStrategy,
	listStrategies,
	updateStrategy,
	type Strategy
} from '../services/strategies';
import type { MassivePlan } from '../services/settings';
import { getQuotes, validateTickers } from '../services/tickers';
import { getPriceHistory, screenMovers, type PriceHistory } from '../services/history';
import type { Mover } from '../market/history';
import type { SeriesPoint } from '../portfolio/valuation';

const PRICES: Record<MassivePlan, string> = {
	basic:
		'get_prices returns only the latest completed close, not intraday prices. Size positions ' +
		'from current prices taken from another source you have (a market-data tool or web search); ' +
		'use get_prices only when no other source is available.',
	starter: 'get_prices returns the latest trade (delayed or real-time, as of priceTime).'
};

function instructions(plan: MassivePlan): string {
	return `Portfolio management server. Each portfolio is a set of whole-share long and short
stock positions valued at daily closing prices (U.S. market, New York time). There is no cash:
performance is P&L relative to gross exposure, compounded daily.

Typical workflow: list_portfolios -> get_portfolio (holdings with last close, performance, history,
pending rebalances) -> get_strategy when the prompt names one -> get_prices for tickers you are
adding or resizing -> submit_portfolio with the COMPLETE target portfolio. ${PRICES[plan]}
get_price_history (split-adjusted daily bars, 52-week range, averages, volatility) and
screen_movers (unusually large recent moves across all U.S. stocks) use end-of-day data through
the latest completed close.
Tickers are checked against a daily list of active U.S.-listed stocks and ETFs; submit_portfolio
checks them too, so use validate_tickers only for symbols you are unsure of.

Every holding carries its thesis and exit plan; weigh them against what has happened since before
holding, resizing, or closing it, and restate them only when your reasoning changes. Closed
positions show how earlier theses played out. The submission fills at the first market close after
it is received; submitting again before that close replaces it.`;
}

const GET_PRICES: Record<MassivePlan, string> = {
	basic:
		'Latest completed close and the close before it for up to 100 tickers (end-of-day data; ' +
		'priceTime is the close). Not a current price: prefer another source for sizing.',
	starter:
		'Latest trade price (delayed or real-time per the data plan; priceTime is the trade time) and ' +
		'previous close for up to 100 tickers. Use it to size whole-share positions.'
};

function round(value: number | null, digits: number): number | null {
	return value === null ? null : Number(value.toFixed(digits));
}

function json(value: unknown): CallToolResult {
	return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

async function guard(fn: () => Promise<unknown>): Promise<CallToolResult> {
	try {
		return json(await fn());
	} catch (error) {
		if (error instanceof ServiceError) {
			return { isError: true, content: [{ type: 'text', text: error.message }] };
		}
		console.error('[mcp] tool failed', error);
		return {
			isError: true,
			content: [{ type: 'text', text: 'Internal error. Try again later.' }]
		};
	}
}

/** Last point of each calendar week, plus the latest point. */
function weekly(series: SeriesPoint[]) {
	const byWeek = new Map<string, SeriesPoint>();
	for (const point of series) {
		const d = new Date(`${point.date}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
		byWeek.set(d.toISOString().slice(0, 10), point);
	}
	return [...byWeek.values()].map((p) => ({
		date: p.date,
		totalReturn: round(p.index - 1, 6),
		cumPnl: round(p.cumPnl, 2),
		grossExposure: round(p.grossExposure, 2)
	}));
}

function metricsOut(view: Pick<PortfolioView, 'metrics'>) {
	const m = view.metrics;
	return {
		asOf: m.asOf,
		totalReturn: round(m.totalReturn, 6),
		lastDayReturn: round(m.lastDayReturn, 6),
		cumPnl: round(m.cumPnl, 2),
		maxDrawdown: round(m.maxDrawdown, 6),
		annualizedVolatility: round(m.annualizedVolatility, 6),
		sharpe: round(m.sharpe, 3),
		longExposure: round(m.longExposure, 2),
		shortExposure: round(m.shortExposure, 2),
		grossExposure: round(m.grossExposure, 2),
		netExposure: round(m.netExposure, 2)
	};
}

function portfolioOut(view: PortfolioView, historyLimit: number, closedLimit: number) {
	return {
		portfolio: {
			slug: view.portfolio.slug,
			name: view.portfolio.name,
			description: view.portfolio.description,
			currentRationale: view.history[0]?.rationale ?? null
		},
		performance: metricsOut(view),
		holdings: view.holdings.map((h) => ({
			ticker: h.ticker,
			side: h.side,
			shares: h.shares,
			avgCost: round(h.avgCost, 4),
			lastClose: h.lastClose,
			lastPriceDate: h.lastPriceDate,
			stale: h.stale,
			marketValue: round(h.marketValue, 2),
			unrealizedPnl: round(h.unrealizedPnl, 2),
			unrealizedPct: round(h.unrealizedPct, 6),
			weight: round(h.weight, 4),
			openedOn: h.openedOn,
			thesis: h.thesis,
			exit: h.exit
		})),
		unfilled: view.unpriced,
		pendingRebalances: view.pending,
		closedPositions: view.closed.slice(0, closedLimit).map((c) => ({
			...c,
			avgCost: round(c.avgCost, 4),
			realizedPnl: round(c.realizedPnl, 2),
			realizedPct: round(c.realizedPct, 6)
		})),
		// Theses of held positions are on holdings; history keeps only the sizes.
		recentRebalances: view.history.slice(0, historyLimit).map((r) => ({
			...r,
			positions: r.positions.map((p) => ({ ticker: p.ticker, side: p.side, shares: p.shares }))
		})),
		weeklyPerformance: weekly(view.series)
	};
}

const price = (value: number) => round(value, 4);
const pct = (value: number | null) => round(value, 6);

function historyOut(h: PriceHistory) {
	if ('error' in h) return h;
	return {
		ticker: h.ticker,
		asOf: h.asOf,
		historyFrom: h.historyFrom,
		sessions: h.sessions,
		close: price(h.close),
		change: pct(h.change),
		high52w: price(h.high52w),
		high52wDate: h.high52wDate,
		low52w: price(h.low52w),
		low52wDate: h.low52wDate,
		fromHigh52w: pct(h.fromHigh52w),
		sma20: h.sma20 === null ? null : price(h.sma20),
		sma50: h.sma50 === null ? null : price(h.sma50),
		sma200: h.sma200 === null ? null : price(h.sma200),
		volatility20: pct(h.volatility20),
		volatility60: pct(h.volatility60),
		avgDollarVolume20: Math.round(h.avgDollarVolume20),
		bars: h.bars.map((b) => ({
			date: b.date,
			open: price(b.open),
			high: price(b.high),
			low: price(b.low),
			close: price(b.close),
			volume: Math.round(b.volume)
		}))
	};
}

function moverOut(m: Mover & { name: string }) {
	return {
		ticker: m.ticker,
		name: m.name,
		eventDate: m.eventDate,
		eventSessions: m.eventSessions,
		move: pct(m.move),
		excess: pct(m.excess),
		sigma: round(m.sigma, 2),
		dailyVolatility: pct(m.dailyVolatility),
		eventHigh: price(m.eventHigh),
		eventLow: price(m.eventLow),
		eventClose: price(m.eventClose),
		close: price(m.close),
		sinceEvent: pct(m.sinceEvent),
		avgDollarVolume20: Math.round(m.avgDollarVolume20)
	};
}

function strategyOut(s: Strategy) {
	return { slug: s.slug, name: s.name, updatedAt: s.updatedAt.toISOString() };
}

const strategyRef = z.string().min(1).describe('Strategy slug or exact name.');

const portfolioRef = z
	.string()
	.min(1)
	.describe('Portfolio slug (from list_portfolios) or exact name.');
const tickerList = z
	.array(
		z
			.string()
			.trim()
			.transform((t) => t.toUpperCase())
			.pipe(z.string().regex(TICKER_PATTERN))
	)
	.min(1)
	.max(100);

/** Builds a server exposing only the tools that `scopes` permit, described for the data plan. */
export function createMcpServer(scopes: ReadonlySet<string>, plan: MassivePlan): McpServer {
	const server = new McpServer(
		{ name: 'ai-portfolios', version: '1.0.0' },
		{ instructions: instructions(plan) }
	);
	const allowed = (tool: string) => scopes.has(TOOL_SCOPES[tool]);

	if (allowed('list_portfolios'))
		server.registerTool(
			'list_portfolios',
			{
				title: 'List portfolios',
				description: 'Lists every portfolio with its performance summary and pending rebalances.',
				annotations: { readOnlyHint: true }
			},
			() =>
				guard(async () =>
					(await listPortfolioSummaries()).map((s) => ({
						slug: s.portfolio.slug,
						name: s.portfolio.name,
						description: s.portfolio.description,
						positions: s.positions,
						pendingRebalances: s.pending.length,
						performance: metricsOut(s)
					}))
				)
		);

	if (allowed('create_portfolio'))
		server.registerTool(
			'create_portfolio',
			{
				title: 'Create portfolio',
				description:
					'Creates an empty portfolio. Use it only when the prompt asks for a new portfolio; ' +
					'check list_portfolios first to avoid duplicates.',
				inputSchema: z.object({
					name: z.string().trim().min(1).max(100),
					slug: z
						.string()
						.optional()
						.describe('Optional URL slug; derived from the name when omitted.'),
					description: z.string().max(2000).optional()
				})
			},
			({ name, slug, description }) =>
				guard(async () => {
					const p = await createPortfolio({
						name,
						slug: slug ?? '',
						description: description ?? ''
					});
					return { slug: p.slug, name: p.name, description: p.description };
				})
		);

	if (allowed('get_portfolio'))
		server.registerTool(
			'get_portfolio',
			{
				title: 'Get portfolio',
				description:
					'Returns current holdings (split-adjusted, with average cost, last close, a stale flag when ' +
					'the ticker had no close on the latest session (halted, delisted, or renamed), weight of gross ' +
					'exposure, open date, and their current thesis and exit plan), the current portfolio ' +
					'rationale, performance metrics, closed positions with realized P&L (price P&L plus ' +
					'dividends) and the thesis and exit plan they were held under, pending rebalances with ' +
					'their orders, recent executed rebalances with fill prices and rationale, and a weekly ' +
					'performance series. `unfilled` lists tickers of the latest executed target that had no ' +
					'price and were not opened. An empty portfolio has no ' +
					'holdings yet and needs a first allocation.',
				inputSchema: z.object({
					portfolio: portfolioRef,
					history_limit: z
						.number()
						.int()
						.min(0)
						.max(200)
						.default(5)
						.describe('How many recent executed rebalances (orders, fills, rationale) to include.'),
					closed_limit: z
						.number()
						.int()
						.min(0)
						.max(500)
						.default(20)
						.describe('How many most recently closed positions to include.')
				}),
				annotations: { readOnlyHint: true }
			},
			({ portfolio, history_limit, closed_limit }) =>
				guard(async () =>
					portfolioOut(await getPortfolioView(portfolio), history_limit, closed_limit)
				)
		);

	if (allowed('submit_portfolio'))
		server.registerTool(
			'submit_portfolio',
			{
				title: 'Submit target portfolio',
				description:
					'Submits the COMPLETE new target portfolio. Any current holding not listed is closed; an ' +
					'empty list closes everything. Shares are whole numbers (no fractions); side is long or ' +
					'short. The rebalance fills at the closing price of the first U.S. market close after ' +
					'submission. Submitting again before that close replaces the pending submission. ' +
					'Every new or side-flipped position needs a thesis and an exit plan; a position kept ' +
					'on the same side inherits its recorded ones unless restated. ' +
					'Returns the fill date and the orders needed to reach the target.',
				inputSchema: z.object({
					portfolio: portfolioRef,
					positions: z.array(positionSchema).max(500),
					rationale: z
						.string()
						.trim()
						.min(1)
						.max(20_000)
						.describe(
							'The thesis for the portfolio as a whole and what changed in this rebalance, ' +
								'including why any positions were closed.'
						),
					strategy: z
						.string()
						.optional()
						.describe('Slug or name of the hosted strategy that guided this decision.')
				})
			},
			({ portfolio, positions, rationale, strategy }) =>
				guard(async () => {
					const pending = await submitPortfolio({ portfolio, positions, rationale, strategy });
					return {
						status: 'pending',
						fillsAtCloseOf: pending.effectiveDate,
						closeTimeNewYork: pending.closeTimeEt,
						closesAt: pending.closesAt,
						orders: pending.orders
					};
				})
		);

	if (allowed('get_prices'))
		server.registerTool(
			'get_prices',
			{
				title: 'Get prices',
				description: GET_PRICES[plan],
				inputSchema: z.object({ tickers: tickerList }),
				annotations: { readOnlyHint: true }
			},
			({ tickers }) => guard(() => getQuotes(tickers))
		);

	if (allowed('get_price_history'))
		server.registerTool(
			'get_price_history',
			{
				title: 'Get price history',
				description:
					'Split-adjusted daily bars (open, high, low, close, volume) for up to 20 U.S. stocks or ' +
					'ETFs, from the last 260 sessions through the latest completed close (the current ' +
					'session is not included). Each ticker also gets its 52-week high and low with their ' +
					'dates, its distance from the 52-week high, 20-, 50-, and 200-session average closes, ' +
					'the standard deviation of daily returns over 20 and 60 sessions, and its average ' +
					'daily dollar volume over 20 sessions. historyFrom shows how far back the data goes. ' +
					'Request SPY or a sector ETF alongside to measure relative moves.',
				inputSchema: z.object({
					tickers: tickerList.max(20),
					sessions: z
						.number()
						.int()
						.min(0)
						.max(260)
						.default(20)
						.describe('How many of the latest daily bars to include; 0 returns the summary only.')
				}),
				annotations: { readOnlyHint: true }
			},
			({ tickers, sessions }) =>
				guard(async () => (await getPriceHistory(tickers, sessions)).map(historyOut))
		);

	if (allowed('screen_movers'))
		server.registerTool(
			'screen_movers',
			{
				title: 'Screen movers',
				description:
					'Screens every U.S.-listed common stock and ADR for unusually large moves in recent ' +
					'sessions, from end-of-day data through the latest completed close (the current ' +
					'session is not included). A move is a one- or two-session return in excess of the ' +
					"benchmark's, measured in standard deviations of the stock's daily excess returns " +
					'over the 60 sessions before the window. Each stock is listed once, with its largest ' +
					'qualifying move, strongest first: the event date and sessions, the price move and ' +
					'excess return, the event high, low, and close, the latest close and the move since, ' +
					'and average daily dollar volume. Finding why a stock moved, and how it moved against ' +
					'its own sector (get_price_history with the sector ETF), is up to you.',
				inputSchema: z.object({
					sessions: z
						.number()
						.int()
						.min(1)
						.max(20)
						.default(10)
						.describe('Only moves that ended within this many of the latest sessions.'),
					min_sigma: z
						.number()
						.min(1)
						.max(20)
						.default(2)
						.describe('Smallest move to list, in standard deviations.'),
					direction: z.enum(['up', 'down', 'both']).default('both'),
					benchmark: z
						.string()
						.trim()
						.transform((t) => t.toUpperCase())
						.pipe(z.string().regex(TICKER_PATTERN))
						.default('SPY')
						.describe(
							'The ETF moves are measured against: SPY, or a sector ETF to screen one sector.'
						),
					min_price: z.number().min(0).default(5).describe('Smallest latest close.'),
					min_dollar_volume: z
						.number()
						.min(0)
						.default(10_000_000)
						.describe('Smallest average daily dollar volume over the last 20 sessions.'),
					limit: z.number().int().min(1).max(200).default(50)
				}),
				annotations: { readOnlyHint: true }
			},
			(input) =>
				guard(async () => {
					const result = await screenMovers({
						sessions: input.sessions,
						minSigma: input.min_sigma,
						direction: input.direction,
						benchmark: input.benchmark,
						minPrice: input.min_price,
						minDollarVolume: input.min_dollar_volume,
						limit: input.limit
					});
					return { ...result, movers: result.movers.map(moverOut) };
				})
		);

	if (allowed('validate_tickers'))
		server.registerTool(
			'validate_tickers',
			{
				title: 'Validate tickers',
				description:
					'Checks tickers against the daily list of active U.S.-listed stocks and ETFs and returns ' +
					'their names and types. Listings from today appear after the next daily update.',
				inputSchema: z.object({ tickers: tickerList }),
				annotations: { readOnlyHint: true }
			},
			({ tickers }) => guard(() => validateTickers(tickers))
		);

	if (allowed('list_strategies'))
		server.registerTool(
			'list_strategies',
			{
				title: 'List strategies',
				description: 'Lists the hosted investment strategies (slug and name).',
				annotations: { readOnlyHint: true }
			},
			() => guard(async () => (await listStrategies()).map(strategyOut))
		);

	if (allowed('get_strategy'))
		server.registerTool(
			'get_strategy',
			{
				title: 'Get strategy',
				description:
					'Returns the full text of a hosted strategy. Follow it when managing a portfolio.',
				inputSchema: z.object({ strategy: strategyRef }),
				annotations: { readOnlyHint: true }
			},
			({ strategy }) =>
				guard(async () => {
					const s = await getStrategy(strategy);
					return { ...strategyOut(s), content: s.content };
				})
		);

	if (allowed('create_strategy'))
		server.registerTool(
			'create_strategy',
			{
				title: 'Create strategy',
				description:
					'Hosts a new investment strategy that agents follow when managing portfolios. Check ' +
					'list_strategies first to avoid duplicates.',
				inputSchema: strategySchema.extend({
					slug: strategySchema.shape.slug.describe(
						'Optional URL slug; derived from the name when omitted.'
					),
					content: strategySchema.shape.content.describe('The full strategy text.')
				})
			},
			(input) => guard(async () => strategyOut(await createStrategy(input)))
		);

	if (allowed('update_strategy'))
		server.registerTool(
			'update_strategy',
			{
				title: 'Update strategy',
				description:
					'Changes a hosted strategy. Omitted fields keep their current value; content replaces ' +
					'the whole text.',
				inputSchema: z.object({
					strategy: strategyRef,
					name: strategySchema.shape.name.optional(),
					// Without the schema's '' default, so an omitted slug keeps the current one.
					slug: strategySchema.shape.slug.unwrap().optional(),
					content: strategySchema.shape.content.optional()
				})
			},
			({ strategy, name, slug, content }) =>
				guard(async () => {
					const current = await getStrategy(strategy);
					const updated = await updateStrategy(current.id, {
						name: name ?? current.name,
						slug: slug ?? current.slug,
						content: content ?? current.content
					});
					return strategyOut(updated);
				})
		);

	return server;
}
