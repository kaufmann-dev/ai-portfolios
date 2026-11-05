import { eq, inArray, max, sql } from 'drizzle-orm';
import { db } from '../db';
import { dailyBars, tickers } from '../db/schema';
import { closeAt, newYorkDate } from '../market/calendar';
import { fetchSnapshots, MassiveError, type Snapshot } from '../massive/client';
import { ServiceError } from './errors';
import { getMassivePlan } from './settings';

export interface TickerCheck {
	ticker: string;
	valid: boolean;
	name: string | null;
	type: string | null;
	reason: string | null;
}

/** Checks tickers against the mirrored list of active U.S.-listed stocks and ETFs. */
export async function validateTickers(symbols: string[]): Promise<TickerCheck[]> {
	const unique = [...new Set(symbols)];
	if (!unique.length) return [];
	const [{ syncedAt }] = await db.select({ syncedAt: max(tickers.syncedAt) }).from(tickers);
	if (!syncedAt) {
		throw new ServiceError('The ticker list is still loading. Try again in a few minutes.', 503);
	}
	const rows = await db.select().from(tickers).where(inArray(tickers.ticker, unique));
	const known = new Map(rows.map((t) => [t.ticker, t]));
	const asOf = newYorkDate(syncedAt);

	return unique.map((ticker) => {
		const hit = known.get(ticker);
		return hit
			? { ticker, valid: true, name: hit.name, type: hit.type, reason: null }
			: {
					ticker,
					valid: false,
					name: null,
					type: null,
					reason:
						`Not an active U.S.-listed stock or ETF (list as of ${asOf}; ` +
						'new listings appear after the next daily update).'
				};
	});
}

export interface Quote {
	ticker: string;
	price: number;
	/** When the price was set: the trade time of a snapshot, or the close it comes from. */
	priceTime: string | null;
	previousClose: number | null;
	source: 'snapshot' | 'close';
}

export type QuoteResult = Quote | { ticker: string; error: string };

/** Each ticker's latest stored close and the close before it. */
async function latestCloses(symbols: string[]) {
	const ranked = db
		.select({
			ticker: dailyBars.ticker,
			date: dailyBars.date,
			close: dailyBars.close,
			previousClose: sql<
				number | null
			>`lag(${dailyBars.close}) over (partition by ${dailyBars.ticker} order by ${dailyBars.date})`.as(
				'previous_close'
			),
			rank: sql<number>`row_number() over (partition by ${dailyBars.ticker} order by ${dailyBars.date} desc)`.as(
				'rank'
			)
		})
		.from(dailyBars)
		.where(inArray(dailyBars.ticker, symbols))
		.as('ranked');
	return db.select().from(ranked).where(eq(ranked.rank, 1));
}

/**
 * Latest prices. On the Basic plan they are the stored latest closes; on Starter and higher, one
 * snapshot request, falling back to the latest close for tickers the snapshot lacks. Previous
 * closes of stored bars are split-adjusted.
 */
export async function getQuotes(symbols: string[]): Promise<QuoteResult[]> {
	const unique = [...new Set(symbols)];
	let snapshots = new Map<string, Snapshot>();
	if ((await getMassivePlan()) !== 'basic') {
		try {
			snapshots = await fetchSnapshots(unique);
		} catch (error) {
			if (error instanceof MassiveError && error.status === 403) {
				throw new ServiceError(
					'Massive refused live prices; set the data plan to Basic in Settings.',
					503
				);
			}
			throw error;
		}
	}
	const missing = unique.filter((t) => !snapshots.has(t));
	const closes = missing.length ? await latestCloses(missing) : [];
	const closeByTicker = new Map(closes.map((c) => [c.ticker, c]));

	return unique.map((ticker): QuoteResult => {
		const snapshot = snapshots.get(ticker);
		if (snapshot) {
			return {
				ticker,
				price: snapshot.price,
				priceTime: snapshot.updatedAt,
				previousClose: snapshot.previousClose,
				source: 'snapshot'
			};
		}
		const close = closeByTicker.get(ticker);
		if (!close) return { ticker, error: 'Unknown ticker or no recent close.' };
		return {
			ticker,
			price: close.close,
			priceTime: closeAt(close.date).toISOString(),
			previousClose: close.previousClose,
			source: 'close'
		};
	});
}
