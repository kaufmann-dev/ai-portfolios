import { MASSIVE_API_KEY } from '$app/env/private';

const BASE_URL = 'https://api.massive.com';
const PAGE_LIMIT = 5000;
const MAX_PAGES = 20;
const TIMEOUT_MS = 30_000;

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
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { Authorization: `Bearer ${MASSIVE_API_KEY}` },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (error) {
		throw new MassiveError(`Massive request failed: ${(error as Error).message}`, null, true);
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

function buildUrl(path: string, params: Record<string, string | number> = {}): string {
	const url = new URL(path, BASE_URL);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
	return url.toString();
}

async function paginate(path: string, params: Record<string, string | number>): Promise<Json[]> {
	const results: Json[] = [];
	let url: string | undefined = buildUrl(path, params);
	for (let page = 0; url && page < MAX_PAGES; page++) {
		const body = await getJson(url);
		results.push(...((body.results as Json[] | undefined) ?? []));
		url = typeof body.next_url === 'string' ? body.next_url : undefined;
	}
	return results;
}

/** Unadjusted closes for every U.S. stock on one session. Empty when Massive has no data yet. */
export async function fetchGroupedCloses(date: string): Promise<Map<string, number>> {
	const body = await getJson(
		buildUrl(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, { adjusted: 'false' })
	);
	const closes = new Map<string, number>();

	for (const bar of (body.results as Json[] | undefined) ?? []) {
		if (typeof bar.T === 'string' && typeof bar.c === 'number' && bar.c > 0)
			closes.set(bar.T, bar.c);
	}
	return closes;
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
	splitFrom: number;
	splitTo: number;
}

/** Splits and stock dividends that take effect before the open of `date`. */
export async function fetchSplits(date: string): Promise<SplitEvent[]> {
	const rows = await paginate('/stocks/v1/splits', { execution_date: date, limit: PAGE_LIMIT });

	return rows.flatMap((row) =>
		typeof row.ticker === 'string' &&
		typeof row.split_from === 'number' &&
		typeof row.split_to === 'number' &&
		row.split_from > 0 &&
		row.split_to > 0
			? [
					{
						ticker: row.ticker,
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

export interface TickerDetails {
	ticker: string;
	name: string;
	market: string | null;
	type: string | null;
	active: boolean;
}

/** Reference data for a ticker, or null when Massive does not know it. */
export async function fetchTickerDetails(ticker: string): Promise<TickerDetails | null> {
	try {
		const body = await getJson(buildUrl(`/v3/reference/tickers/${encodeURIComponent(ticker)}`));
		const r = body.results as Json | undefined;
		if (!r || typeof r.ticker !== 'string') return null;
		return {
			ticker: r.ticker,
			name: typeof r.name === 'string' ? r.name : r.ticker,
			market: typeof r.market === 'string' ? r.market : null,
			type: typeof r.type === 'string' ? r.type : null,
			active: r.active !== false
		};
	} catch (error) {
		if (error instanceof MassiveError && error.status === 404) return null;
		throw error;
	}
}

export interface Quote {
	ticker: string;
	/** Latest traded price available on the account's plan (may be delayed). */
	price: number | null;
	previousClose: number | null;
	updatedAt: string | null;
}

function positive(value: unknown): number | null {
	return typeof value === 'number' && value > 0 ? value : null;
}

/** Latest price from the snapshot, falling back to the previous close on plans without snapshots. */
export async function fetchQuote(ticker: string): Promise<Quote> {
	try {
		const body = await getJson(
			buildUrl(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`)
		);
		const t = (body.ticker ?? {}) as Record<string, Json | number | undefined>;
		const lastTrade = (t.lastTrade ?? {}) as Json;
		const minute = (t.min ?? {}) as Json;
		const day = (t.day ?? {}) as Json;
		const prevDay = (t.prevDay ?? {}) as Json;
		const updated = typeof t.updated === 'number' ? new Date(t.updated / 1e6).toISOString() : null;
		return {
			ticker,
			price: positive(lastTrade.p) ?? positive(minute.c) ?? positive(day.c) ?? positive(prevDay.c),
			previousClose: positive(prevDay.c),
			updatedAt: updated
		};
	} catch (error) {
		if (!(error instanceof MassiveError) || (error.status !== 403 && error.status !== 404)) {
			throw error;
		}
	}
	const body = await getJson(buildUrl(`/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`));
	const bar = ((body.results as Json[] | undefined) ?? [])[0];
	const close = positive(bar?.c);
	return {
		ticker,
		price: close,
		previousClose: close,
		updatedAt: typeof bar?.t === 'number' ? new Date(bar.t).toISOString() : null
	};
}
