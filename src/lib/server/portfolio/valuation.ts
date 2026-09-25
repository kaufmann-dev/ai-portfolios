/**
 * Deterministic portfolio valuation at daily closes. Pure: the same inputs always produce the same
 * output, and nothing is stored. There is no cash: each day's P&L is measured against the previous
 * close's gross exposure and chained into a time-weighted index.
 */
import { diffOrders } from './trades';
import type { CorporateAction, Order, Position, Side } from './types';

export interface ExecutedRebalance {
	id: number;
	effectiveDate: string;
	positions: Position[];
}

export interface ValuationInput {
	/** Executed rebalances, in any order. */
	rebalances: ExecutedRebalance[];
	/** Unadjusted closes: ticker -> date -> close. */
	bars: Map<string, Map<string, number>>;
	actions: CorporateAction[];
	/** Ordered trading sessions to value, starting at or before the first effective date. */
	sessions: string[];
}

export interface SeriesPoint {
	date: string;
	/** Growth of 1 since inception. */
	index: number;
	dailyReturn: number;
	pnl: number;
	cumPnl: number;
	grossExposure: number;
	netExposure: number;
}

export interface Holding {
	ticker: string;
	side: Side;
	shares: number;
	avgCost: number;
	lastClose: number;
	lastPriceDate: string;
	marketValue: number;
	unrealizedPnl: number;
	unrealizedPct: number;
	/** Share of the portfolio's gross exposure. */
	weight: number;
	/** Effective date of the rebalance that opened the position on its current side. */
	openedOn: string;
	stale: boolean;
}

/** A position held from its opening until it was fully closed or flipped to the other side. */
export interface ClosedPosition {
	ticker: string;
	side: Side;
	openedOn: string;
	closedOn: string;
	/** Split-adjusted average cost when the last shares were closed. */
	avgCost: number;
	/** Price at which the last shares were closed. */
	exitPrice: number;
	/** Price P&L of every share sold or covered plus dividends, over the position's life. */
	realizedPnl: number;
	/** `realizedPnl` per dollar of shares bought or shorted into the position. */
	realizedPct: number;
}

export interface Metrics {
	totalReturn: number;
	lastDayReturn: number;
	cumPnl: number;
	maxDrawdown: number;
	annualizedVolatility: number | null;
	sharpe: number | null;
	longExposure: number;
	shortExposure: number;
	grossExposure: number;
	netExposure: number;
	asOf: string | null;
}

export interface Valuation {
	series: SeriesPoint[];
	holdings: Holding[];
	/** Most recently closed first. */
	closed: ClosedPosition[];
	metrics: Metrics;
	/** Fill prices per rebalance id: ticker -> close on the effective date. */
	fills: Map<number, Map<string, number>>;
	/** Orders each rebalance executed, relative to the split-adjusted holdings before it. */
	orders: Map<number, Order[]>;
	/** Target tickers that had no price at all when their rebalance executed. */
	unpriced: string[];
}

interface OpenPosition {
	side: Side;
	shares: number;
	avgCost: number;
	openedOn: string;
	/** Dollars of shares bought or shorted into the position. */
	invested: number;
	realized: number;
}

interface LastPrice {
	close: number;
	date: string;
}

const TRADING_DAYS_PER_YEAR = 252;

function sign(side: Side): 1 | -1 {
	return side === 'long' ? 1 : -1;
}

export function valuePortfolio(input: ValuationInput): Valuation {
	const byDate = new Map<string, ExecutedRebalance>();
	for (const r of [...input.rebalances].sort((a, b) => a.id - b.id)) byDate.set(r.effectiveDate, r);

	const actionsByDate = new Map<string, CorporateAction[]>();
	for (const action of input.actions) {
		const list = actionsByDate.get(action.date) ?? [];
		list.push(action);
		actionsByDate.set(action.date, list);
	}

	const firstDate = [...byDate.keys()].sort()[0];
	const sessions = firstDate ? input.sessions.filter((d) => d >= firstDate) : [];

	const open = new Map<string, OpenPosition>();
	const last = new Map<string, LastPrice>();
	const fills = new Map<number, Map<string, number>>();
	const orders = new Map<number, Order[]>();
	const unpriced = new Set<string>();
	const closed: ClosedPosition[] = [];
	const series: SeriesPoint[] = [];
	let index = 1;
	let cumPnl = 0;
	let prevGross = 0;

	const closeOn = (ticker: string, date: string) => input.bars.get(ticker)?.get(date);
	const recordClose = (ticker: string, p: OpenPosition, price: number, day: string) =>
		closed.push({
			ticker,
			side: p.side,
			openedOn: p.openedOn,
			closedOn: day,
			avgCost: p.avgCost,
			exitPrice: price,
			realizedPnl: p.realized,
			realizedPct: p.invested > 0 ? p.realized / p.invested : 0
		});

	for (const day of sessions) {
		let pnl = 0;

		for (const action of actionsByDate.get(day) ?? []) {
			const position = open.get(action.ticker);
			if (!position) continue;
			if (action.kind === 'split' && action.splitFrom && action.splitTo) {
				// Splits apply before the open: rescale shares and the reference prices.
				const ratio = action.splitTo / action.splitFrom;
				position.shares *= ratio;
				position.avgCost /= ratio;
				const prev = last.get(action.ticker);
				if (prev) prev.close /= ratio;
			} else if (action.kind === 'dividend' && action.cashAmount) {
				const cash = sign(position.side) * position.shares * action.cashAmount;
				pnl += cash;
				position.realized += cash;
			}
		}

		for (const [ticker, position] of open) {
			const prev = last.get(ticker);
			const close = closeOn(ticker, day);
			if (!prev || close === undefined) continue;
			pnl += sign(position.side) * position.shares * (close - prev.close);
			last.set(ticker, { close, date: day });
		}

		// Fractional shares left by a split are settled in cash at today's close.
		for (const [ticker, position] of open) {
			const whole = Math.floor(position.shares + 1e-9);
			if (whole === position.shares) continue;
			const price = last.get(ticker)?.close ?? position.avgCost;
			position.realized +=
				sign(position.side) * (position.shares - whole) * (price - position.avgCost);
			position.shares = whole;
			if (whole === 0) {
				recordClose(ticker, position, price, day);
				open.delete(ticker);
			}
		}

		const dailyReturn = prevGross > 0 ? pnl / prevGross : 0;
		index *= 1 + dailyReturn;
		cumPnl += pnl;

		const rebalance = byDate.get(day);
		if (rebalance) {
			const dayOrders = diffOrders(
				[...open].map(([ticker, p]) => ({ ticker, side: p.side, shares: p.shares })),
				rebalance.positions
			);
			orders.set(rebalance.id, dayOrders);
			const dayFills = new Map<string, number>();
			// Exits fill at the same close as entries.
			for (const order of dayOrders) {
				const price = closeOn(order.ticker, day) ?? last.get(order.ticker)?.close;
				if (price !== undefined) dayFills.set(order.ticker, price);
			}
			const targets = new Map(rebalance.positions.map((t) => [t.ticker, t]));
			for (const [ticker, prior] of open) {
				const target = targets.get(ticker);
				const kept = target?.side === prior.side ? target.shares : 0;
				if (kept >= prior.shares) continue;
				const price = closeOn(ticker, day) ?? last.get(ticker)!.close;
				prior.realized += sign(prior.side) * (prior.shares - kept) * (price - prior.avgCost);
				if (kept === 0) recordClose(ticker, prior, price, day);
			}
			const next = new Map<string, OpenPosition>();
			for (const target of rebalance.positions) {
				const price = closeOn(target.ticker, day) ?? last.get(target.ticker)?.close;
				if (price === undefined) {
					unpriced.add(target.ticker);
					continue;
				}
				dayFills.set(target.ticker, price);
				if (!last.has(target.ticker) || closeOn(target.ticker, day) !== undefined) {
					last.set(target.ticker, { close: price, date: day });
				}
				const prior = open.get(target.ticker);
				if (prior && prior.side === target.side) {
					const added = Math.max(target.shares - prior.shares, 0);
					next.set(target.ticker, {
						...prior,
						shares: target.shares,
						avgCost: (prior.shares * prior.avgCost + added * price) / (prior.shares + added),
						invested: prior.invested + added * price
					});
				} else {
					next.set(target.ticker, {
						side: target.side,
						shares: target.shares,
						avgCost: price,
						openedOn: day,
						invested: target.shares * price,
						realized: 0
					});
				}
			}
			open.clear();
			for (const [ticker, position] of next) open.set(ticker, position);
			fills.set(rebalance.id, dayFills);
		}

		let gross = 0;
		let net = 0;
		for (const [ticker, position] of open) {
			const value = position.shares * (last.get(ticker)?.close ?? 0);
			gross += value;
			net += sign(position.side) * value;
		}
		prevGross = gross;

		series.push({
			date: day,
			index,
			dailyReturn,
			pnl,
			cumPnl,
			grossExposure: gross,
			netExposure: net
		});
	}

	const asOf = series.at(-1)?.date ?? null;
	const gross = [...open].reduce((a, [ticker, p]) => a + p.shares * last.get(ticker)!.close, 0);
	const holdings: Holding[] = [...open]
		.map(([ticker, position]) => {
			const price = last.get(ticker)!;
			const s = sign(position.side);
			const marketValue = position.shares * price.close;
			return {
				ticker,
				side: position.side,
				shares: position.shares,
				avgCost: position.avgCost,
				lastClose: price.close,
				lastPriceDate: price.date,
				marketValue,
				unrealizedPnl: s * position.shares * (price.close - position.avgCost),
				unrealizedPct: position.avgCost > 0 ? s * (price.close / position.avgCost - 1) : 0,
				weight: gross > 0 ? marketValue / gross : 0,
				openedOn: position.openedOn,
				stale: asOf !== null && price.date < asOf
			};
		})
		.sort((a, b) => a.ticker.localeCompare(b.ticker));

	return {
		series,
		holdings,
		closed: closed.reverse(),
		metrics: computeMetrics(series, holdings),
		fills,
		orders,
		unpriced: [...unpriced]
	};
}

function computeMetrics(series: SeriesPoint[], holdings: Holding[]): Metrics {
	let peak = 1;
	let maxDrawdown = 0;
	for (const point of series) {
		peak = Math.max(peak, point.index);
		maxDrawdown = Math.min(maxDrawdown, point.index / peak - 1);
	}

	// The first session only opens positions; returns start the day after.
	const returns = series.slice(1).map((p) => p.dailyReturn);
	let annualizedVolatility: number | null = null;
	let sharpe: number | null = null;
	if (returns.length >= 2) {
		const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
		const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
		const std = Math.sqrt(variance);
		annualizedVolatility = std * Math.sqrt(TRADING_DAYS_PER_YEAR);
		sharpe = std > 0 ? (mean / std) * Math.sqrt(TRADING_DAYS_PER_YEAR) : null;
	}

	const longExposure = holdings
		.filter((h) => h.side === 'long')
		.reduce((a, h) => a + h.marketValue, 0);
	const shortExposure = holdings
		.filter((h) => h.side === 'short')
		.reduce((a, h) => a + h.marketValue, 0);
	const lastPoint = series.at(-1);

	return {
		totalReturn: (lastPoint?.index ?? 1) - 1,
		lastDayReturn: lastPoint?.dailyReturn ?? 0,
		cumPnl: lastPoint?.cumPnl ?? 0,
		maxDrawdown,
		annualizedVolatility,
		sharpe,
		longExposure,
		shortExposure,
		grossExposure: longExposure + shortExposure,
		netExposure: longExposure - shortExposure,
		asOf: lastPoint?.date ?? null
	};
}
