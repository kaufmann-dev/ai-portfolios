import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { TOOL_SCOPES } from './scopes';
import { z } from 'zod';
import { positionSchema, TICKER_PATTERN } from '$lib/schemas';
import { ServiceError } from '../services/errors';
import {
	createPortfolio,
	getPortfolioView,
	listPortfolioSummaries,
	submitPortfolio,
	type PortfolioView
} from '../services/portfolios';
import { getStrategy, listStrategies } from '../services/strategies';
import { getQuotes, validateTickers } from '../services/tickers';
import type { SeriesPoint } from '../portfolio/valuation';

const INSTRUCTIONS = `Portfolio management server. Each portfolio is a set of whole-share long and short
stock positions valued at daily closing prices (U.S. market, New York time). There is no cash:
performance is P&L relative to gross exposure, compounded daily.

Typical workflow: list_portfolios -> get_portfolio (holdings, performance, history, pending
rebalances) -> get_strategy when the prompt names one -> get_prices to size positions ->
submit_portfolio with the COMPLETE target portfolio. The submission fills at the first market close
after it is received; submitting again before that close replaces it.`;

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

function portfolioOut(view: PortfolioView, historyLimit: number) {
	return {
		portfolio: {
			slug: view.portfolio.slug,
			name: view.portfolio.name,
			description: view.portfolio.description
		},
		performance: metricsOut(view),
		holdings: view.holdings.map((h) => ({
			ticker: h.ticker,
			side: h.side,
			shares: h.shares,
			avgCost: round(h.avgCost, 4),
			lastClose: h.lastClose,
			lastPriceDate: h.lastPriceDate,
			marketValue: round(h.marketValue, 2),
			unrealizedPnl: round(h.unrealizedPnl, 2),
			unrealizedPct: round(h.unrealizedPct, 6)
		})),
		pendingRebalances: view.pending,
		recentRebalances: view.history.slice(0, historyLimit),
		weeklyPerformance: weekly(view.series)
	};
}

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

/** Builds a server exposing only the tools that `scopes` permit. */
export function createMcpServer(scopes: ReadonlySet<string>): McpServer {
	const server = new McpServer(
		{ name: 'ai-portfolios', version: '1.0.0' },
		{ instructions: INSTRUCTIONS }
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
					'Returns current holdings (split-adjusted, with average cost and last close), performance ' +
					'metrics, pending rebalances with their orders, recent executed rebalances with fill ' +
					'prices and rationale, and a weekly performance series. An empty portfolio has no ' +
					'holdings yet and needs a first allocation.',
				inputSchema: z.object({
					portfolio: portfolioRef,
					history_limit: z
						.number()
						.int()
						.min(0)
						.max(200)
						.default(20)
						.describe('How many recent executed rebalances to include.')
				}),
				annotations: { readOnlyHint: true }
			},
			({ portfolio, history_limit }) =>
				guard(async () => portfolioOut(await getPortfolioView(portfolio), history_limit))
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
					'Returns the fill date and the orders needed to reach the target.',
				inputSchema: z.object({
					portfolio: portfolioRef,
					positions: z.array(positionSchema).max(500),
					rationale: z
						.string()
						.max(20_000)
						.optional()
						.describe('Why these positions were chosen; shown in the portfolio history.'),
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
				description:
					'Latest available price (may be delayed depending on the data plan) and previous close ' +
					'for up to 100 tickers. Use it to size whole-share positions.',
				inputSchema: z.object({ tickers: tickerList }),
				annotations: { readOnlyHint: true }
			},
			({ tickers }) => guard(() => getQuotes(tickers))
		);

	if (allowed('validate_tickers'))
		server.registerTool(
			'validate_tickers',
			{
				title: 'Validate tickers',
				description: 'Checks that tickers are active U.S. stocks or ETFs and returns their names.',
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
			() =>
				guard(async () =>
					(await listStrategies()).map((s) => ({
						slug: s.slug,
						name: s.name,
						updatedAt: s.updatedAt.toISOString()
					}))
				)
		);

	if (allowed('get_strategy'))
		server.registerTool(
			'get_strategy',
			{
				title: 'Get strategy',
				description:
					'Returns the full text of a hosted strategy. Follow it when managing a portfolio.',
				inputSchema: z.object({
					strategy: z.string().min(1).describe('Strategy slug or exact name.')
				}),
				annotations: { readOnlyHint: true }
			},
			({ strategy }) =>
				guard(async () => {
					const s = await getStrategy(strategy);
					return {
						slug: s.slug,
						name: s.name,
						updatedAt: s.updatedAt.toISOString(),
						content: s.content
					};
				})
		);

	return server;
}
