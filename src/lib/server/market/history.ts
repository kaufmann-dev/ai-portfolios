/**
 * Pure calculations over split-adjusted daily bars: per-ticker summaries and the market-wide
 * screen for unusually large moves. Bars are ordered oldest first.
 */

export interface Bar {
	date: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

/** Sessions in a 52-week range. */
export const YEAR_SESSIONS = 252;
/** Sessions of daily excess returns that set a stock's volatility for the screen. */
export const ESTIMATION_SESSIONS = 60;
/** Fewest estimation returns a stock needs before the screen measures its moves. */
export const MIN_ESTIMATION_RETURNS = 20;
/** Sessions averaged for dollar volume. */
export const LIQUIDITY_SESSIONS = 20;

export interface HistorySummary {
	asOf: string;
	close: number;
	change: number | null;
	high52w: number;
	high52wDate: string;
	low52w: number;
	low52wDate: string;
	fromHigh52w: number;
	sma20: number | null;
	sma50: number | null;
	sma200: number | null;
	volatility20: number | null;
	volatility60: number | null;
	avgDollarVolume20: number;
}

function mean(values: number[]): number {
	return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sample standard deviation, or null with fewer than two values. */
export function stdev(values: number[]): number | null {
	if (values.length < 2) return null;
	const m = mean(values);
	return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

function averageClose(bars: Bar[], n: number): number | null {
	return bars.length >= n ? mean(bars.slice(-n).map((b) => b.close)) : null;
}

function returnVolatility(bars: Bar[], n: number): number | null {
	if (bars.length < n + 1) return null;
	const recent = bars.slice(-(n + 1));
	return stdev(recent.slice(1).map((b, i) => b.close / recent[i].close - 1));
}

function dollarVolume(bars: Bar[]): number {
	return mean(bars.slice(-LIQUIDITY_SESSIONS).map((b) => b.close * b.volume));
}

/** Latest close, 52-week range, averages, volatility, and liquidity of a non-empty series. */
export function summarize(bars: Bar[]): HistorySummary {
	const last = bars[bars.length - 1];
	const year = bars.slice(-YEAR_SESSIONS);
	let high = year[0];
	let low = year[0];
	for (const b of year) {
		if (b.high >= high.high) high = b;
		if (b.low <= low.low) low = b;
	}
	const previous = bars.length > 1 ? bars[bars.length - 2] : null;
	return {
		asOf: last.date,
		close: last.close,
		change: previous ? last.close / previous.close - 1 : null,
		high52w: high.high,
		high52wDate: high.date,
		low52w: low.low,
		low52wDate: low.date,
		fromHigh52w: last.close / high.high - 1,
		sma20: averageClose(bars, 20),
		sma50: averageClose(bars, 50),
		sma200: averageClose(bars, 200),
		volatility20: returnVolatility(bars, 20),
		volatility60: returnVolatility(bars, 60),
		avgDollarVolume20: dollarVolume(bars)
	};
}

export interface MoverOptions {
	/** Moves must end within this many of the latest sessions. */
	window: number;
	minSigma: number;
	direction: 'up' | 'down' | 'both';
}

interface Candidate {
	/** Index of the event's last session. */
	end: number;
	n: 1 | 2;
	excess: number;
	sigma: number;
}

export interface Mover {
	ticker: string;
	eventDate: string;
	eventSessions: 1 | 2;
	/** Price return over the event sessions. */
	move: number;
	/** Return in excess of the benchmark over the event sessions. */
	excess: number;
	/** The excess return in standard deviations of the stock's daily excess returns. */
	sigma: number;
	/** Standard deviation of daily excess returns before the window. */
	dailyVolatility: number;
	eventHigh: number;
	eventLow: number;
	eventClose: number;
	close: number;
	sinceEvent: number;
	avgDollarVolume20: number;
}

/**
 * Each stock's largest one- or two-session move ending within the window, in standard deviations
 * of its daily returns in excess of the benchmark over the sessions before the window. `sessions`
 * are the benchmark's session dates, oldest first; the last one is the latest session. Stocks
 * without a bar on the latest session or with too little history are skipped. Strongest first.
 */
export function findMovers(
	sessions: string[],
	benchmark: Map<string, Bar>,
	series: Map<string, Map<string, Bar>>,
	options: MoverOptions
): Mover[] {
	const latest = sessions[sessions.length - 1];
	const windowStart = Math.max(1, sessions.length - options.window);
	const benchmarkReturns = sessions.map((date, i) => {
		const today = benchmark.get(date);
		const before = i > 0 ? benchmark.get(sessions[i - 1]) : undefined;
		return today && before ? today.close / before.close - 1 : null;
	});

	const movers: Mover[] = [];
	for (const [ticker, bars] of series) {
		const last = bars.get(latest);
		if (!last) continue;

		const excess = sessions.map((date, i) => {
			const today = bars.get(date);
			const before = i > 0 ? bars.get(sessions[i - 1]) : undefined;
			const market = benchmarkReturns[i];
			return today && before && market !== null ? today.close / before.close - 1 - market : null;
		});
		const estimation = excess
			.slice(Math.max(1, windowStart - ESTIMATION_SESSIONS), windowStart)
			.filter((e): e is number => e !== null);
		if (estimation.length < MIN_ESTIMATION_RETURNS) continue;
		const sd = stdev(estimation);
		if (!sd) continue;

		const candidates: Candidate[] = [];
		for (let i = windowStart; i < sessions.length; i++) {
			const one = excess[i];
			if (one === null) continue;
			candidates.push({ end: i, n: 1, excess: one, sigma: one / sd });
			const prior = excess[i - 1];
			if (i - 1 >= windowStart && prior !== null) {
				const two = one + prior;
				candidates.push({ end: i, n: 2, excess: two, sigma: two / (sd * Math.SQRT2) });
			}
		}
		const event = candidates
			.filter(
				(c) =>
					Math.abs(c.sigma) >= options.minSigma &&
					(options.direction === 'both' || options.direction === (c.sigma > 0 ? 'up' : 'down'))
			)
			.reduce<Candidate | null>(
				(best, c) => (!best || Math.abs(c.sigma) > Math.abs(best.sigma) ? c : best),
				null
			);
		if (!event) continue;

		const eventBars = sessions
			.slice(event.end - event.n + 1, event.end + 1)
			.map((date) => bars.get(date)!);
		const start = bars.get(sessions[event.end - event.n])!;
		const close = eventBars[eventBars.length - 1].close;
		const recent = sessions.slice(-LIQUIDITY_SESSIONS).flatMap((date) => bars.get(date) ?? []);
		movers.push({
			ticker,
			eventDate: sessions[event.end],
			eventSessions: event.n,
			move: close / start.close - 1,
			excess: event.excess,
			sigma: event.sigma,
			dailyVolatility: sd,
			eventHigh: Math.max(...eventBars.map((b) => b.high)),
			eventLow: Math.min(...eventBars.map((b) => b.low)),
			eventClose: close,
			close: last.close,
			sinceEvent: last.close / close - 1,
			avgDollarVolume20: dollarVolume(recent)
		});
	}
	return movers.sort(
		(a, b) => Math.abs(b.sigma) - Math.abs(a.sigma) || a.ticker.localeCompare(b.ticker)
	);
}
