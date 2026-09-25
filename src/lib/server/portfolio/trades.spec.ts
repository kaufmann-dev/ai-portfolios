import { describe, expect, it } from 'vitest';
import { diffOrders } from './trades';

describe('diffOrders', () => {
	it('opens every position from an empty portfolio', () => {
		expect(
			diffOrders(
				[],
				[
					{ ticker: 'MSFT', side: 'long', shares: 5 },
					{ ticker: 'AAPL', side: 'short', shares: 3 }
				]
			)
		).toEqual([
			{ action: 'buy', ticker: 'MSFT', shares: 5 },
			{ action: 'sell_short', ticker: 'AAPL', shares: 3 }
		]);
	});

	it('resizes, closes, and flips positions with exits first', () => {
		const orders = diffOrders(
			[
				{ ticker: 'AAPL', side: 'long', shares: 10 },
				{ ticker: 'MSFT', side: 'long', shares: 4 },
				{ ticker: 'TSLA', side: 'short', shares: 6 },
				{ ticker: 'NVDA', side: 'short', shares: 2 },
				{ ticker: 'SPY', side: 'long', shares: 1 }
			],
			[
				{ ticker: 'AAPL', side: 'long', shares: 12 },
				{ ticker: 'MSFT', side: 'long', shares: 1 },
				{ ticker: 'TSLA', side: 'long', shares: 2 },
				{ ticker: 'NVDA', side: 'short', shares: 5 },
				{ ticker: 'SPY', side: 'long', shares: 1 }
			]
		);
		expect(orders).toEqual([
			{ action: 'sell', ticker: 'MSFT', shares: 3 },
			{ action: 'buy_to_cover', ticker: 'TSLA', shares: 6 },
			{ action: 'buy', ticker: 'AAPL', shares: 2 },
			{ action: 'buy', ticker: 'TSLA', shares: 2 },
			{ action: 'sell_short', ticker: 'NVDA', shares: 3 }
		]);
	});

	it('closes everything for an empty target', () => {
		expect(diffOrders([{ ticker: 'AAPL', side: 'short', shares: 7 }], [])).toEqual([
			{ action: 'buy_to_cover', ticker: 'AAPL', shares: 7 }
		]);
	});
});
