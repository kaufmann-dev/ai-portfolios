import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { dailyBars, tickers } from '../db/schema';
import {
	ESTIMATION_SESSIONS,
	findMovers,
	LIQUIDITY_SESSIONS,
	MIN_ESTIMATION_RETURNS,
	summarize,
	type Bar,
	type HistorySummary,
	type Mover
} from '../market/history';
import { ServiceError } from './errors';

/** Ticker types the screen covers: common stocks, ADRs, and ordinary shares. */
const STOCK_TYPES = ['CS', 'ADRC', 'OS'];

const barColumns = {
	ticker: dailyBars.ticker,
	date: dailyBars.date,
	open: dailyBars.open,
	high: dailyBars.high,
	low: dailyBars.low,
	close: dailyBars.close,
	volume: dailyBars.volume
};

function toBar(row: Bar & { ticker: string }): Bar {
	const { date, open, high, low, close, volume } = row;
	return { date, open, high, low, close, volume };
}

export type PriceHistory =
	| (HistorySummary & { ticker: string; historyFrom: string; sessions: number; bars: Bar[] })
	| { ticker: string; error: string };

/** Summaries of each ticker's stored daily bars, with the latest `barCount` bars. */
export async function getPriceHistory(
	symbols: string[],
	barCount: number
): Promise<PriceHistory[]> {
	const unique = [...new Set(symbols)];
	const rows = await db
		.select(barColumns)
		.from(dailyBars)
		.where(inArray(dailyBars.ticker, unique))
		.orderBy(dailyBars.ticker, dailyBars.date);
	const byTicker = Map.groupBy(rows, (r) => r.ticker);

	return unique.map((ticker): PriceHistory => {
		const bars = byTicker.get(ticker)?.map(toBar);
		if (!bars?.length) {
			return { ticker, error: 'No price history: unknown ticker or no trades in the last year.' };
		}
		return {
			ticker,
			historyFrom: bars[0].date,
			sessions: bars.length,
			...summarize(bars),
			bars: barCount ? bars.slice(-barCount) : []
		};
	});
}

export interface ScreenOptions {
	sessions: number;
	minSigma: number;
	direction: 'up' | 'down' | 'both';
	benchmark: string;
	minPrice: number;
	minDollarVolume: number;
	limit: number;
}

export interface ScreenResult {
	asOf: string;
	benchmark: string;
	windowFrom: string;
	matches: number;
	movers: (Mover & { name: string })[];
}

/** Stocks with unusually large one- or two-session moves relative to the benchmark. */
export async function screenMovers(options: ScreenOptions): Promise<ScreenResult> {
	const benchmarkBars = (
		await db
			.select(barColumns)
			.from(dailyBars)
			.where(eq(dailyBars.ticker, options.benchmark))
			.orderBy(desc(dailyBars.date))
			.limit(options.sessions + ESTIMATION_SESSIONS + 1)
	).reverse();
	if (!benchmarkBars.length) {
		throw new ServiceError(`No price history for the benchmark ${options.benchmark}.`, 404);
	}
	if (benchmarkBars.length < options.sessions + MIN_ESTIMATION_RETURNS + 1) {
		throw new ServiceError(
			`Price history is still loading (${benchmarkBars.length} sessions so far). Try again later.`,
			503
		);
	}
	const sessions = benchmarkBars.map((b) => b.date);
	const asOf = sessions[sessions.length - 1];
	const liquidFrom = sessions[Math.max(0, sessions.length - LIQUIDITY_SESSIONS)];

	const eligible = db
		.select({ ticker: dailyBars.ticker })
		.from(dailyBars)
		.innerJoin(tickers, eq(tickers.ticker, dailyBars.ticker))
		.where(and(gte(dailyBars.date, liquidFrom), inArray(tickers.type, STOCK_TYPES)))
		.groupBy(dailyBars.ticker)
		.having(
			and(
				sql`max(${dailyBars.date}) = ${asOf}`,
				sql`avg(${dailyBars.close} * ${dailyBars.volume}) >= ${options.minDollarVolume}`,
				sql`(array_agg(${dailyBars.close} order by ${dailyBars.date} desc))[1] >= ${options.minPrice}`
			)
		);
	const rows = await db
		.select(barColumns)
		.from(dailyBars)
		.where(and(gte(dailyBars.date, sessions[0]), inArray(dailyBars.ticker, eligible)));

	const series = new Map<string, Map<string, Bar>>();
	for (const row of rows) {
		let bars = series.get(row.ticker);
		if (!bars) series.set(row.ticker, (bars = new Map()));
		bars.set(row.date, toBar(row));
	}
	const movers = findMovers(
		sessions,
		new Map(benchmarkBars.map((row) => [row.date, toBar(row)])),
		series,
		{ window: options.sessions, minSigma: options.minSigma, direction: options.direction }
	);

	const top = movers.slice(0, options.limit);
	const names = top.length
		? await db
				.select({ ticker: tickers.ticker, name: tickers.name })
				.from(tickers)
				.where(
					inArray(
						tickers.ticker,
						top.map((m) => m.ticker)
					)
				)
		: [];
	const nameByTicker = new Map(names.map((n) => [n.ticker, n.name]));
	return {
		asOf,
		benchmark: options.benchmark,
		windowFrom: sessions[Math.max(0, sessions.length - options.sessions)],
		matches: movers.length,
		movers: top.map((m) => ({ ...m, name: nameByTicker.get(m.ticker) ?? m.ticker }))
	};
}
