import { describe, expect, it } from 'vitest';
import { findMovers, summarize, type Bar } from './history';

/** Synthetic session dates, oldest first. */
const SESSIONS = Array.from({ length: 81 }, (_, i) => `2026-S${String(i).padStart(3, '0')}`);

function bars(closes: number[], dates = SESSIONS): Bar[] {
	return closes.map((close, i) => ({
		date: dates[i],
		open: close,
		high: close * 1.01,
		low: close * 0.99,
		close,
		volume: 1000
	}));
}

function byDate(series: Bar[]): Map<string, Bar> {
	return new Map(series.map((b) => [b.date, b]));
}

/** Closes from daily returns, starting at 100. */
function path(returns: number[]): number[] {
	const closes = [100];
	for (const r of returns) closes.push(closes[closes.length - 1] * (1 + r));
	return closes;
}

/** ±1% alternating returns: a daily volatility of about 1%. */
const noise = (n: number): number[] => Array.from({ length: n }, (_, i) => (i % 2 ? -0.01 : 0.01));

const flat = byDate(bars(SESSIONS.map(() => 100)));
const options = { window: 10, minSigma: 2, direction: 'both' as const };

describe('summarize', () => {
	it('finds the 52-week range, averages, and volatility', () => {
		const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
		closes[5] = 150;
		const s = summarize(bars(closes));

		expect(s.asOf).toBe(SESSIONS[29]);
		expect(s.close).toBe(129);
		expect(s.change).toBeCloseTo(129 / 128 - 1, 10);
		expect(s.high52w).toBeCloseTo(151.5, 10);
		expect(s.high52wDate).toBe(SESSIONS[5]);
		expect(s.low52w).toBeCloseTo(99, 10);
		expect(s.low52wDate).toBe(SESSIONS[0]);
		expect(s.fromHigh52w).toBeCloseTo(129 / 151.5 - 1, 10);
		expect(s.sma20).toBeCloseTo(119.5, 10);
		expect(s.sma50).toBeNull();
		expect(s.volatility20).toBeGreaterThan(0);
		expect(s.volatility60).toBeNull();
		expect(s.avgDollarVolume20).toBeCloseTo(119.5 * 1000, 6);
	});

	it('handles a single bar', () => {
		const s = summarize(bars([50]));
		expect(s.change).toBeNull();
		expect(s.high52w).toBeCloseTo(50.5, 10);
		expect(s.volatility20).toBeNull();
	});
});

describe('findMovers', () => {
	it('measures a one-session jump in standard deviations of excess returns', () => {
		const returns = noise(80);
		returns[75] = 0.08; // return into session 76, inside the ten-session window
		const [mover, ...rest] = findMovers(
			SESSIONS,
			flat,
			new Map([['JUMP', byDate(bars(path(returns)))]]),
			options
		);

		expect(rest).toEqual([]);
		expect(mover.ticker).toBe('JUMP');
		expect(mover.eventDate).toBe(SESSIONS[76]);
		expect(mover.eventSessions).toBe(1);
		expect(mover.move).toBeCloseTo(0.08, 10);
		expect(mover.sigma).toBeGreaterThan(7);
		expect(mover.dailyVolatility).toBeCloseTo(0.01, 3);
		expect(mover.eventClose).toBeCloseTo(path(returns)[76], 10);
		expect(mover.sinceEvent).toBeCloseTo(path(returns)[80] / path(returns)[76] - 1, 10);
	});

	it('prefers a two-session move when it is larger in standard deviations', () => {
		const returns = noise(80);
		returns[77] = 0.03;
		returns[78] = 0.03;
		const [mover] = findMovers(
			SESSIONS,
			flat,
			new Map([['TWO', byDate(bars(path(returns)))]]),
			options
		);

		expect(mover.eventSessions).toBe(2);
		expect(mover.eventDate).toBe(SESSIONS[79]);
		expect(mover.excess).toBeCloseTo(0.06, 10);
		expect(mover.eventLow).toBeCloseTo(path(returns)[78] * 0.99, 10);
	});

	it('measures moves against the benchmark, not in absolute terms', () => {
		const marketReturns = noise(80);
		marketReturns[75] = 0.05;
		const market = byDate(bars(path(marketReturns)));
		const movers = findMovers(
			SESSIONS,
			market,
			new Map([['BETA', byDate(bars(path(marketReturns)))]]),
			options
		);
		expect(movers).toEqual([]);
	});

	it('filters by direction and threshold, strongest first', () => {
		const up = noise(80);
		up[75] = 0.08;
		up[76] = -0.04;
		const small = noise(80);
		small[75] = 0.015;
		const down = noise(80);
		down[72] = -0.06;
		const series = new Map([
			['UP', byDate(bars(path(up)))],
			['SMALL', byDate(bars(path(small)))],
			['DOWN', byDate(bars(path(down)))]
		]);

		expect(findMovers(SESSIONS, flat, series, options).map((m) => m.ticker)).toEqual([
			'UP',
			'DOWN'
		]);
		const falling = findMovers(SESSIONS, flat, series, { ...options, direction: 'down' });
		expect(falling.map((m) => [m.ticker, m.eventDate])).toEqual([
			['DOWN', SESSIONS[73]],
			['UP', SESSIONS[77]]
		]);
		expect(falling.every((m) => m.sigma < 0)).toBe(true);
	});

	it('skips stocks without a latest bar or with too little history', () => {
		const returns = noise(80);
		returns[75] = 0.1;
		const full = bars(path(returns));
		const movers = findMovers(
			SESSIONS,
			flat,
			new Map([
				['GONE', byDate(full.slice(0, 80))],
				['NEW', byDate(full.slice(60))]
			]),
			options
		);
		expect(movers).toEqual([]);
	});
});
