import type { Order, OrderAction, Position } from './types';

const ACTION_ORDER: Record<OrderAction, number> = {
	sell: 0,
	buy_to_cover: 1,
	buy: 2,
	sell_short: 3
};

function exit(position: Position, shares: number): Order {
	return {
		action: position.side === 'long' ? 'sell' : 'buy_to_cover',
		ticker: position.ticker,
		shares
	};
}

function entry(position: Position, shares: number): Order {
	return {
		action: position.side === 'long' ? 'buy' : 'sell_short',
		ticker: position.ticker,
		shares
	};
}

/** Orders that turn `current` holdings into `target`. Exits are listed before entries. */
export function diffOrders(current: Position[], target: Position[]): Order[] {
	const before = new Map(current.map((p) => [p.ticker, p]));
	const after = new Map(target.map((p) => [p.ticker, p]));
	const orders: Order[] = [];

	for (const ticker of new Set([...before.keys(), ...after.keys()])) {
		const from = before.get(ticker);
		const to = after.get(ticker);
		if (from && !to) {
			orders.push(exit(from, from.shares));
		} else if (!from && to) {
			orders.push(entry(to, to.shares));
		} else if (from && to && from.side !== to.side) {
			orders.push(exit(from, from.shares), entry(to, to.shares));
		} else if (from && to && to.shares > from.shares) {
			orders.push(entry(to, to.shares - from.shares));
		} else if (from && to && to.shares < from.shares) {
			orders.push(exit(from, from.shares - to.shares));
		}
	}

	return orders.sort(
		(a, b) => ACTION_ORDER[a.action] - ACTION_ORDER[b.action] || a.ticker.localeCompare(b.ticker)
	);
}
