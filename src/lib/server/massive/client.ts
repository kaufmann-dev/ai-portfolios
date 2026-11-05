import { MASSIVE_API_KEY } from '$app/env/private';
import { getMassivePlan } from '../services/settings';
import { RateLimiter } from './limiter';

const BASE_URL = 'https://api.massive.com';
const PAGE_LIMIT = 5000;
const MAX_PAGES = 20;
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RATE_LIMITED_WAIT_MS = 60_000;

/** The free Basic plan allows 5 requests per minute; Starter and higher are unlimited. */
const basicLimiter = new RateLimiter(5, 60_000);

export class MassiveError extends Error {
	constructor(
		message: string,
		readonly status: number | null,
		/** Worth retrying on a later run: rate limits, outages, network failures. */
		readonly transient: boolean
	) {
		super(message);
	}
}

type Json = Record<string, unknown>;

async function getJson(url: string): Promise<Json> {
	for (let attempt = 1; ; attempt++) {
		if ((await getMassivePlan()) === 'basic') await basicLimiter.acquire();
		let response: Response;
		try {
			response = await fetch(url, {
				headers: { Authorization: `Bearer ${MASSIVE_API_KEY}` },
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});
		} catch (error) {
			throw new MassiveError(`Massive request failed: ${(error as Error).message}`, null, true);
		}
		if (response.status === 429 && attempt < MAX_ATTEMPTS) {
			const retryAfter = Number(response.headers.get('retry-after'));
			await new Promise((resolve) =>
				setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : RATE_LIMITED_WAIT_MS)
			);
			continue;
		}
		if (!response.ok) {
			const path = new URL(url).pathname;
			throw new MassiveError(
				`Massive ${path} responded ${response.status}`,
				response.status,
				response.status === 429 || response.status >= 500
			);
		}
		return (await response.json()) as Json;
	}
}

function buildUrl(path: string, params: Record<string, string | number> = {}): string {
	const url = new URL(path, BASE_URL);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
	return url.toString();
}

/** Every page of a listing. Throws rather than return a truncated listing. */
async function paginate(
	path: string,
	params: Record<string, string | number>,
	maxPages = MAX_PAGES
): Promise<Json[]> {
	const results: Json[] = [];
	let url: string | undefined = buildUrl(path, params);
	for (let page = 0; url; page++) {
		if (page === maxPages) {
			throw new MassiveError(`Massive ${path} has more than ${maxPages} pages`, null, false);
		}
		const body = await getJson(url);
		results.push(...((body.results as Json[] | undefined) ?? []));
		url = typeof body.next_url === 'string' ? body.next_url : undefined;
	}
	return results;
}

function positive(value: unknown): number | null {
	return typeof value === 'number' && value > 0 ? value : null;
}

export interface DailyBar {
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

/**
 * Daily bars of every U.S. stock on one session, unadjusted or adjusted for the splits Massive
 * knows of. Empty when Massive has no data for the session yet.
 */
export async function fetchGroupedBars(
	date: string,
	adjusted: boolean
): Promise<Map<string, DailyBar>> {
	const body = await getJson(
		buildUrl(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, { adjusted: String(adjusted) })
	);
	const bars = new Map<string, DailyBar>();
	for (const bar of (body.results as Json[] | undefined) ?? []) {
		const close = positive(bar.c);
		if (typeof bar.T !== 'string' || close === null) continue;
		bars.set(bar.T, {
			open: positive(bar.o) ?? close,
			high: positive(bar.h) ?? close,
			low: positive(bar.l) ?? close,
			close,
			volume: typeof bar.v === 'number' && bar.v > 0 ? bar.v : 0
		});
	}
	return bars;
}

/** Unadjusted close for one ticker on one session, or null. */
export async function fetchTickerClose(ticker: string, date: string): Promise<number | null> {
	const body = await getJson(
		buildUrl(`/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${date}/${date}`, {
			adjusted: 'false'
		})
	);
	const bar = ((body.results as Json[] | undefined) ?? [])[0];

	return typeof bar?.c === 'number' ? bar.c : null;
}

export interface SplitEvent {
	ticker: string;
	/** The first session that trades at the split-adjusted price. */
	date: string;
	splitFrom: number;
	splitTo: number;
}

/** Splits and stock dividends that take effect before the open of a session from `from` to `to`. */
export async function fetchSplits(from: string, to = from): Promise<SplitEvent[]> {
	const rows = await paginate('/stocks/v1/splits', {
		'execution_date.gte': from,
		'execution_date.lte': to,
		limit: PAGE_LIMIT
	});

	return rows.flatMap((row) =>
		typeof row.ticker === 'string' &&
		typeof row.execution_date === 'string' &&
		typeof row.split_from === 'number' &&
		typeof row.split_to === 'number' &&
		row.split_from > 0 &&
		row.split_to > 0
			? [
					{
						ticker: row.ticker,
						date: row.execution_date,
						splitFrom: row.split_from,
						splitTo: row.split_to
					}
				]
			: []
	);
}

export interface DividendEvent {
	ticker: string;
	cashAmount: number;
}

/** USD cash dividends whose ex-dividend date is `date`. */
export async function fetchDividends(date: string): Promise<DividendEvent[]> {
	const rows = await paginate('/stocks/v1/dividends', {
		ex_dividend_date: date,
		limit: PAGE_LIMIT
	});
	return rows.flatMap((row) =>
		typeof row.ticker === 'string' &&
		typeof row.cash_amount === 'number' &&
		row.cash_amount > 0 &&
		(row.currency === undefined || row.currency === 'USD')
			? [{ ticker: row.ticker, cashAmount: row.cash_amount }]
			: []
	);
}

export interface ListedTicker {
	ticker: string;
	name: string;
	type: string | null;
}

/** Every active U.S.-listed stock and ETF (about a dozen pages). */
export async function fetchTickerList(): Promise<ListedTicker[]> {
	const rows = await paginate('/v3/reference/tickers', {
		market: 'stocks',
		active: 'true',
		limit: 1000
	});
	return rows.flatMap((r) =>
		typeof r.ticker === 'string'
			? [
					{
						ticker: r.ticker,
						name: typeof r.name === 'string' ? r.name : r.ticker,
						type: typeof r.type === 'string' ? r.type : null
					}
				]
			: []
	);
}

export interface Snapshot {
	/** Latest traded price available on the account's plan (delayed or real-time). */
	price: number;
	previousClose: number | null;
	updatedAt: string | null;
}

/** Snapshots of the given tickers in one request (Starter plan and higher). Unknown tickers are absent. */
export async function fetchSnapshots(tickers: string[]): Promise<Map<string, Snapshot>> {
	const body = await getJson(
		buildUrl('/v2/snapshot/locale/us/markets/stocks/tickers', { tickers: tickers.join(',') })
	);
	const snapshots = new Map<string, Snapshot>();
	for (const t of (body.tickers as Json[] | undefined) ?? []) {
		if (typeof t.ticker !== 'string') continue;
		const lastTrade = (t.lastTrade ?? {}) as Json;
		const minute = (t.min ?? {}) as Json;
		const day = (t.day ?? {}) as Json;
		const prevDay = (t.prevDay ?? {}) as Json;
		const price =
			positive(lastTrade.p) ?? positive(minute.c) ?? positive(day.c) ?? positive(prevDay.c);
		if (price === null) continue;
		snapshots.set(t.ticker, {
			price,
			previousClose: positive(prevDay.c),
			updatedAt: typeof t.updated === 'number' ? new Date(t.updated / 1e6).toISOString() : null
		});
	}
	return snapshots;
}
