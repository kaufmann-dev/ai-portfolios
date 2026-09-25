import { gt, inArray, and } from 'drizzle-orm';
import { db } from '../db';
import { tickers } from '../db/schema';
import { fetchQuote, fetchTickerDetails, MassiveError, type Quote } from '../massive/client';

const CACHE_MS = 7 * 86_400_000;

export interface TickerCheck {
	ticker: string;
	valid: boolean;
	name: string | null;
	reason: string | null;
}

/** Checks that each ticker is an active U.S. stock or ETF on Massive. Valid results are cached. */
export async function validateTickers(symbols: string[], now = new Date()): Promise<TickerCheck[]> {
	const unique = [...new Set(symbols)];
	const cached = unique.length
		? await db
				.select()
				.from(tickers)
				.where(
					and(
						inArray(tickers.ticker, unique),
						gt(tickers.checkedAt, new Date(now.getTime() - CACHE_MS))
					)
				)
		: [];
	const known = new Map(cached.filter((t) => t.active).map((t) => [t.ticker, t]));

	return Promise.all(
		unique.map(async (ticker): Promise<TickerCheck> => {
			const hit = known.get(ticker);
			if (hit) return { ticker, valid: true, name: hit.name, reason: null };

			const details = await fetchTickerDetails(ticker);
			if (!details) return { ticker, valid: false, name: null, reason: 'Unknown ticker.' };
			if (details.market !== 'stocks') {
				return { ticker, valid: false, name: details.name, reason: 'Not a U.S. stock or ETF.' };
			}
			if (!details.active) {
				return { ticker, valid: false, name: details.name, reason: 'No longer traded.' };
			}
			await db
				.insert(tickers)
				.values({ ticker, name: details.name, type: details.type, active: true, checkedAt: now })
				.onConflictDoUpdate({
					target: tickers.ticker,
					set: { name: details.name, type: details.type, active: true, checkedAt: now }
				});
			return { ticker, valid: true, name: details.name, reason: null };
		})
	);
}

export type QuoteResult = Quote | { ticker: string; error: string };

export async function getQuotes(symbols: string[]): Promise<QuoteResult[]> {
	return Promise.all(
		[...new Set(symbols)].map(async (ticker) => {
			try {
				const quote = await fetchQuote(ticker);
				if (quote.price === null) return { ticker, error: 'No price available; check the ticker.' };
				return quote;
			} catch (error) {
				const message =
					error instanceof MassiveError && error.status === 404
						? 'Unknown ticker.'
						: 'Price unavailable right now.';
				return { ticker, error: message };
			}
		})
	);
}
