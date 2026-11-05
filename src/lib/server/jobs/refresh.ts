/**
 * Fetches closing prices and corporate actions for every tracked ticker, one trading session at a
 * time, keeps a year of split-adjusted daily bars of every U.S. ticker, marks pending rebalances
 * whose close now has prices as executed, and mirrors the list of listed tickers once per trading
 * day. Idempotent.
 */
import { and, eq, inArray, lt, lte, max, min, sql } from 'drizzle-orm';
import { db, type Tx } from '../db';
import {
	corporateActions,
	dailyBars,
	marketSessions,
	priceBars,
	rebalancePositions,
	rebalances,
	tickers
} from '../db/schema';
import {
	addDays,
	closeAt,
	lastCompletedSession,
	nextTradingDay,
	tradingDaysBetween
} from '../market/calendar';
import {
	fetchDividends,
	fetchGroupedBars,
	fetchSplits,
	fetchTickerClose,
	fetchTickerList,
	MassiveError,
	type DailyBar
} from '../massive/client';

/** Massive's daily bars settle shortly after the close. */
const SETTLE_MS = 30 * 60_000;
/** A scheduled session still without data this long after its close was an unscheduled closure. */
const CLOSURE_MS = 36 * 3_600_000;
/** Rows per insert statement, well below PostgreSQL's parameter limit. */
const CHUNK = 1000;
/** Sessions of daily bars kept for price history and screens: a year plus a margin. */
const HISTORY_SESSIONS = 260;
/** Missing history sessions fetched per run, so a first backfill does not hold up other work. */
const BACKFILL_PER_RUN = 30;

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
		await syncTickers(now);
		await backfillHistory();
	} catch (error) {
		if (error instanceof MassiveError && error.transient) {
			console.warn(`[refresh] deferred: ${error.message}`);
			return;
		}
		console.error('[refresh] failed', error);
	}
}

/** Market-wide bars of a session, or null while the plan does not serve that session yet. */
async function groupedBars(date: string, adjusted: boolean): Promise<Map<string, DailyBar> | null> {
	try {
		return await fetchGroupedBars(date, adjusted);
	} catch (error) {
		if (error instanceof MassiveError && error.status === 403) {
			console.info(`[refresh] closes for ${date} are not available on the current plan yet`);
			return null;
		}
		throw error;
	}
}

async function fetchMissingSessions(now: Date): Promise<void> {
	const last = lastCompletedSession(now);
	const [{ first }] = await db.select({ first: min(rebalances.effectiveDate) }).from(rebalances);
	const fetched = new Set(
		(await db.select({ date: marketSessions.date }).from(marketSessions)).map((s) => s.date)
	);

	for (const date of tradingDaysBetween(first && first < last ? first : last, last)) {
		if (fetched.has(date)) continue;
		const sinceClose = now.getTime() - closeAt(date).getTime();
		if (sinceClose < SETTLE_MS) break;

		// Unadjusted: the stored closes value positions at the prices they traded at.
		const bars = await groupedBars(date, false);
		if (bars === null) break; // Sessions must be stored in order.
		if (bars.size === 0) {
			if (sinceClose < CLOSURE_MS) break; // Not published yet.
			await recordClosure(date);
			continue;
		}
		await storeSession(date, bars);
	}
}

async function insertDailyBars(tx: Tx, date: string, bars: Map<string, DailyBar>): Promise<void> {
	const rows = [...bars].map(([ticker, bar]) => ({ ticker, date, ...bar }));
	for (let i = 0; i < rows.length; i += CHUNK) {
		await tx
			.insert(dailyBars)
			.values(rows.slice(i, i + CHUNK))
			.onConflictDoNothing();
	}
}

/** A bar from before a split, in post-split shares (`ratio` new shares per old share). */
function rescale(bar: DailyBar, ratio: number): DailyBar {
	return {
		open: bar.open / ratio,
		high: bar.high / ratio,
		low: bar.low / ratio,
		close: bar.close / ratio,
		volume: bar.volume * ratio
	};
}

/** Rescales a ticker's earlier daily bars for a split that takes effect before the open of `date`. */
async function rescaleHistory(tx: Tx, ticker: string, date: string, ratio: number): Promise<void> {
	await tx
		.update(dailyBars)
		.set({
			open: sql`${dailyBars.open} / ${ratio}`,
			high: sql`${dailyBars.high} / ${ratio}`,
			low: sql`${dailyBars.low} / ${ratio}`,
			close: sql`${dailyBars.close} / ${ratio}`,
			volume: sql`${dailyBars.volume} * ${ratio}`
		})
		.where(and(eq(dailyBars.ticker, ticker), lt(dailyBars.date, date)));
}

async function trackedTickers(date: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ ticker: rebalancePositions.ticker })
		.from(rebalancePositions)
		.innerJoin(rebalances, eq(rebalances.id, rebalancePositions.rebalanceId))
		.where(lte(rebalances.effectiveDate, date));
	return rows.map((r) => r.ticker);
}

async function storeSession(date: string, sessionBars: Map<string, DailyBar>): Promise<void> {
	const tickers = await trackedTickers(date);
	const tracked = new Set(tickers);
	const [splits, dividends] = await Promise.all([fetchSplits(date), fetchDividends(date)]);

	const bars: { ticker: string; date: string; close: number }[] = [];
	for (const ticker of tickers) {
		let close = sessionBars.get(ticker)?.close ?? null;
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
	for (const s of splits) {
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
		...[...splitByTicker]
			.filter(([ticker]) => tracked.has(ticker))
			.map(([ticker, s]) => ({
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
		for (const [ticker, s] of splitByTicker) {
			await rescaleHistory(tx, ticker, date, s.splitTo / s.splitFrom);
		}
		await insertDailyBars(tx, date, sessionBars);
		await tx.insert(marketSessions).values({ date, hadData: true }).onConflictDoNothing();
	});
	console.info(
		`[refresh] stored ${date}: ${bars.length} closes, ${actions.length} corporate actions`
	);
}

/**
 * Fills the daily-bar history to the last HISTORY_SESSIONS stored sessions, newest first, and drops
 * older bars. Backfilled sessions are fetched unadjusted and rescaled here for the splits through
 * the latest stored session; storeSession rescales every stored bar for later splits.
 */
async function backfillHistory(): Promise<void> {
	const [{ latest }] = await db
		.select({ latest: max(marketSessions.date) })
		.from(marketSessions)
		.where(eq(marketSessions.hadData, true));
	if (!latest) return;
	const sessions = tradingDaysBetween(addDays(latest, -400), latest).slice(-HISTORY_SESSIONS);
	await db.delete(dailyBars).where(lt(dailyBars.date, sessions[0]));

	const stored = await db.execute<{ date: string }>(sql`
		select d::text as date from unnest(${`{${sessions.join(',')}}`}::date[]) as d
		where exists (select 1 from ${dailyBars} where ${dailyBars.date} = d)`);
	const closures = await db
		.select({ date: marketSessions.date })
		.from(marketSessions)
		.where(eq(marketSessions.hadData, false));
	const skip = new Set([...stored.map((r) => r.date), ...closures.map((c) => c.date)]);
	const missing = sessions.filter((d) => !skip.has(d)).reverse();
	if (!missing.length) return;

	const splits = await fetchSplits(addDays(sessions[0], 1), latest);
	for (const date of missing.slice(0, BACKFILL_PER_RUN)) {
		const bars = await groupedBars(date, false);
		if (bars === null) break;
		if (bars.size === 0) continue;
		for (const split of splits) {
			const bar = split.date > date ? bars.get(split.ticker) : undefined;
			if (bar) bars.set(split.ticker, rescale(bar, split.splitTo / split.splitFrom));
		}
		await db.transaction((tx) => insertDailyBars(tx, date, bars));
	}
	console.info(
		`[refresh] price history: fetched up to ${BACKFILL_PER_RUN} of ${missing.length} missing sessions`
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

/** Mirrors the list of active U.S.-listed stocks and ETFs once after each close. */
async function syncTickers(now: Date): Promise<void> {
	const [{ syncedAt }] = await db.select({ syncedAt: max(tickers.syncedAt) }).from(tickers);
	if (syncedAt && syncedAt >= closeAt(lastCompletedSession(now))) return;

	const listed = await fetchTickerList();
	if (!listed.length) return;
	await db.transaction(async (tx) => {
		for (let i = 0; i < listed.length; i += CHUNK) {
			await tx
				.insert(tickers)
				.values(listed.slice(i, i + CHUNK).map((t) => ({ ...t, syncedAt: now })))
				.onConflictDoUpdate({
					target: tickers.ticker,
					set: { name: sql`excluded.name`, type: sql`excluded.type`, syncedAt: now }
				});
		}
		await tx.delete(tickers).where(lt(tickers.syncedAt, now));
	});
	console.info(`[refresh] synced ${listed.length} listed tickers`);
}
