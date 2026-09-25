import { describe, expect, it } from 'vitest';
import type { CorporateAction } from './types';
import { valuePortfolio, type ExecutedRebalance } from './valuation';

const D = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];

function bars(prices: Record<string, number[]>): Map<string, Map<string, number>> {
	return new Map(
		Object.entries(prices).map(([ticker, closes]) => [
			ticker,
			new Map(closes.map((close, i) => [D[i], close] as [string, number]))
		])
	);
}

function split(ticker: string, date: string, from: number, to: number): CorporateAction {
	return { ticker, date, kind: 'split', splitFrom: from, splitTo: to, cashAmount: null };
}

function dividend(ticker: string, date: string, cash: number): CorporateAction {
	return { ticker, date, kind: 'dividend', splitFrom: null, splitTo: null, cashAmount: cash };
}

describe('valuePortfolio', () => {
	it('returns an empty valuation without executed rebalances', () => {
		const v = valuePortfolio({ rebalances: [], bars: new Map(), actions: [], sessions: D });
		expect(v.series).toEqual([]);
		expect(v.metrics.totalReturn).toBe(0);
	});

	it('measures long and short P&L against gross exposure', () => {
		const rebalances: ExecutedRebalance[] = [
			{
				id: 1,
				effectiveDate: D[0],
				positions: [
					{ ticker: 'AAA', side: 'long', shares: 10 },
					{ ticker: 'BBB', side: 'short', shares: 5 }
				]
			}
		];
		const v = valuePortfolio({
			rebalances,
			bars: bars({ AAA: [100, 110], BBB: [200, 190] }),
			actions: [],
			sessions: D.slice(0, 2)
		});
		// Day 1: gross = 1000 + 1000. Day 2: +100 long, +50 short.
		expect(v.series[0].dailyReturn).toBe(0);
		expect(v.series[1].pnl).toBeCloseTo(150);
		expect(v.series[1].dailyReturn).toBeCloseTo(150 / 2000);
		expect(v.metrics.totalReturn).toBeCloseTo(0.075);
		expect(v.metrics.longExposure).toBeCloseTo(1100);
		expect(v.metrics.shortExposure).toBeCloseTo(950);
		const short = v.holdings.find((h) => h.ticker === 'BBB')!;
		expect(short.unrealizedPnl).toBeCloseTo(50);
		expect(short.unrealizedPct).toBeCloseTo(0.05);
	});

	it('chains returns across a mid-series rebalance and fills at the effective close', () => {
		const v = valuePortfolio({
			rebalances: [
				{ id: 1, effectiveDate: D[0], positions: [{ ticker: 'AAA', side: 'long', shares: 10 }] },
				{ id: 2, effectiveDate: D[1], positions: [{ ticker: 'AAA', side: 'long', shares: 20 }] }
			],
			bars: bars({ AAA: [100, 110, 121] }),
			actions: [],
			sessions: D.slice(0, 3)
		});
		expect(v.series.map((p) => p.dailyReturn)).toEqual([0, 0.1, expect.closeTo(0.1)]);
		expect(v.metrics.totalReturn).toBeCloseTo(0.21);
		expect(v.metrics.cumPnl).toBeCloseTo(100 + 220);
		expect(v.fills.get(2)?.get('AAA')).toBe(110);
		expect(v.orders.get(2)).toEqual([{ action: 'buy', ticker: 'AAA', shares: 10 }]);
		// Adding 10 shares at 110 blends the average cost.
		expect(v.holdings[0].avgCost).toBeCloseTo(105);
	});

	it('earns nothing while flat', () => {
		const v = valuePortfolio({
			rebalances: [
				{ id: 1, effectiveDate: D[0], positions: [{ ticker: 'AAA', side: 'long', shares: 10 }] },
				{ id: 2, effectiveDate: D[1], positions: [] }
			],
			bars: bars({ AAA: [100, 90, 50, 40] }),
			actions: [],
			sessions: D.slice(0, 4)
		});
		expect(v.series.map((p) => p.dailyReturn)).toEqual([0, -0.1, 0, 0]);
		expect(v.holdings).toEqual([]);
		// The exit fills at the close of its effective date.
		expect(v.orders.get(2)).toEqual([{ action: 'sell', ticker: 'AAA', shares: 10 }]);
		expect(v.fills.get(2)?.get('AAA')).toBe(90);
		expect(v.metrics.maxDrawdown).toBeCloseTo(-0.1);
	});

	it('records closed positions with realized P&L across reductions, dividends, and flips', () => {
		const v = valuePortfolio({
			rebalances: [
				{ id: 1, effectiveDate: D[0], positions: [{ ticker: 'AAA', side: 'long', shares: 10 }] },
				{ id: 2, effectiveDate: D[1], positions: [{ ticker: 'AAA', side: 'long', shares: 5 }] },
				{ id: 3, effectiveDate: D[2], positions: [{ ticker: 'AAA', side: 'short', shares: 4 }] },
				{ id: 4, effectiveDate: D[3], positions: [] }
			],
			bars: bars({ AAA: [100, 110, 120, 90] }),
			actions: [dividend('AAA', D[2], 1)],
			sessions: D.slice(0, 4)
		});
		expect(v.holdings).toEqual([]);
		expect(v.closed).toEqual([
			{
				ticker: 'AAA',
				side: 'short',
				openedOn: D[2],
				closedOn: D[3],
				avgCost: 120,
				exitPrice: 90,
				realizedPnl: expect.closeTo(120),
				realizedPct: expect.closeTo(120 / 480)
			},
			{
				ticker: 'AAA',
				side: 'long',
				openedOn: D[0],
				closedOn: D[2],
				avgCost: 100,
				exitPrice: 120,
				// 5 sold at 110, a 1.00 dividend on the other 5, then 5 sold at 120.
				realizedPnl: expect.closeTo(50 + 5 + 100),
				realizedPct: expect.closeTo(155 / 1000)
			}
		]);
	});

	it('weights holdings by gross exposure and keeps the open date when adding', () => {
		const v = valuePortfolio({
			rebalances: [
				{
					id: 1,
					effectiveDate: D[0],
					positions: [
						{ ticker: 'AAA', side: 'long', shares: 10 },
						{ ticker: 'BBB', side: 'short', shares: 5 }
					]
				},
				{
					id: 2,
					effectiveDate: D[1],
					positions: [
						{ ticker: 'AAA', side: 'long', shares: 30 },
						{ ticker: 'BBB', side: 'short', shares: 5 }
					]
				}
			],
			bars: bars({ AAA: [100, 100], BBB: [200, 200] }),
			actions: [],
			sessions: D.slice(0, 2)
		});
		expect(v.holdings.map((h) => [h.ticker, h.weight, h.openedOn])).toEqual([
			['AAA', 0.75, D[0]],
			['BBB', 0.25, D[0]]
		]);
		expect(v.closed).toEqual([]);
	});

	it('rescales shares on a forward split without a fake loss', () => {
		const v = valuePortfolio({
			rebalances: [
				{ id: 1, effectiveDate: D[0], positions: [{ ticker: 'AAA', side: 'long', shares: 10 }] }
			],
			bars: bars({ AAA: [100, 51] }),
			actions: [split('AAA', D[1], 1, 2)],
			sessions: D.slice(0, 2)
		});
		expect(v.series[1].pnl).toBeCloseTo(20); // 20 shares * (51 - 50)
		expect(v.holdings[0].shares).toBe(20);
		expect(v.holdings[0].avgCost).toBeCloseTo(50);
	});

	it('settles fractional shares left by a reverse split', () => {
		const v = valuePortfolio({
			rebalances: [
				{ id: 1, effectiveDate: D[0], positions: [{ ticker: 'AAA', side: 'short', shares: 10 }] }
			],
			bars: bars({ AAA: [10, 30, 33] }),
			actions: [split('AAA', D[1], 3, 1)],
			sessions: D.slice(0, 3)
		});
		expect(v.series[1].pnl).toBeCloseTo(0);
		expect(v.holdings[0].shares).toBe(3);
		// Day 3 P&L on the remaining 3 shares short: -3 * 3.
		expect(v.series[2].pnl).toBeCloseTo(-9);
	});

	it('credits dividends to longs and charges them to shorts on the ex-date', () => {
		const v = valuePortfolio({
			rebalances: [
				{
					id: 1,
					effectiveDate: D[0],
					positions: [
						{ ticker: 'AAA', side: 'long', shares: 10 },
						{ ticker: 'BBB', side: 'short', shares: 10 }
					]
				}
			],
			bars: bars({ AAA: [100, 99], BBB: [100, 99] }),
			actions: [dividend('AAA', D[1], 1), dividend('BBB', D[1], 1)],
			sessions: D.slice(0, 2)
		});
		// Long: -10 price + 10 dividend. Short: +10 price - 10 dividend.
		expect(v.series[1].pnl).toBeCloseTo(0);
	});

	it('lists unpriced targets of the latest rebalance only', () => {
		const target = [{ ticker: 'NEW', side: 'long' as const, shares: 1 }];
		const v = valuePortfolio({
			rebalances: [
				{ id: 1, effectiveDate: D[0], positions: target },
				{ id: 2, effectiveDate: D[1], positions: target }
			],
			bars: new Map([['NEW', new Map([[D[1], 10]])]]),
			actions: [],
			sessions: D.slice(0, 2)
		});
		expect(v.unpriced).toEqual([]);
		expect(v.holdings.map((h) => [h.ticker, h.openedOn])).toEqual([['NEW', D[1]]]);

		const stuck = valuePortfolio({
			rebalances: [{ id: 1, effectiveDate: D[0], positions: target }],
			bars: new Map(),
			actions: [],
			sessions: D.slice(0, 2)
		});
		expect(stuck.unpriced).toEqual(['NEW']);
	});

	it('carries the last close forward and flags stale holdings', () => {
		const v = valuePortfolio({
			rebalances: [
				{ id: 1, effectiveDate: D[0], positions: [{ ticker: 'AAA', side: 'long', shares: 1 }] }
			],
			bars: new Map([['AAA', new Map([[D[0], 100]])]]),
			actions: [],
			sessions: D.slice(0, 2)
		});
		expect(v.series[1].pnl).toBe(0);
		expect(v.holdings[0].stale).toBe(true);
	});

	it('computes volatility and Sharpe from daily returns', () => {
		const v = valuePortfolio({
			rebalances: [
				{ id: 1, effectiveDate: D[0], positions: [{ ticker: 'AAA', side: 'long', shares: 1 }] }
			],
			bars: bars({ AAA: [100, 101, 100, 102] }),
			actions: [],
			sessions: D.slice(0, 4)
		});
		expect(v.metrics.annualizedVolatility).toBeGreaterThan(0);
		expect(v.metrics.sharpe).not.toBeNull();
		expect(v.metrics.asOf).toBe(D[3]);
	});
});
