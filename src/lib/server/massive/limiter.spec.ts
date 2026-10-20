import { describe, expect, it } from 'vitest';
import { RateLimiter } from './limiter';

function fakeClock() {
	let time = 0;
	const sleeps: number[] = [];
	return {
		now: () => time,
		sleep: async (ms: number) => {
			sleeps.push(ms);
			time += ms;
		},
		sleeps
	};
}

describe('RateLimiter', () => {
	it('lets `limit` calls start at once', async () => {
		const clock = fakeClock();
		const limiter = new RateLimiter(5, 60_000, clock.now, clock.sleep);
		for (let i = 0; i < 5; i++) await limiter.acquire();
		expect(clock.sleeps).toEqual([]);
	});

	it('makes the next call wait until the oldest leaves the window', async () => {
		const clock = fakeClock();
		const limiter = new RateLimiter(5, 60_000, clock.now, clock.sleep);
		await Promise.all(Array.from({ length: 7 }, () => limiter.acquire()));
		expect(clock.sleeps).toEqual([60_000]);
		expect(clock.now()).toBe(60_000);
	});

	it('serves waiting callers in order', async () => {
		const clock = fakeClock();
		const limiter = new RateLimiter(1, 1_000, clock.now, clock.sleep);
		const order: number[] = [];
		await Promise.all([1, 2, 3].map((n) => limiter.acquire().then(() => order.push(n))));
		expect(order).toEqual([1, 2, 3]);
		expect(clock.now()).toBe(2_000);
	});
});
