const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Allows at most `limit` calls to start within any `windowMs`; later callers wait their turn. */
export class RateLimiter {
	private readonly starts: number[] = [];
	private queue: Promise<void> = Promise.resolve();

	constructor(
		private readonly limit: number,
		private readonly windowMs: number,
		private readonly now: () => number = Date.now,
		private readonly sleep: (ms: number) => Promise<void> = defaultSleep
	) {}

	acquire(): Promise<void> {
		const turn = this.queue.then(() => this.take());
		this.queue = turn.catch(() => {});
		return turn;
	}

	private async take(): Promise<void> {
		for (;;) {
			const now = this.now();
			while (this.starts.length && this.starts[0] <= now - this.windowMs) this.starts.shift();
			if (this.starts.length < this.limit) {
				this.starts.push(now);
				return;
			}
			await this.sleep(this.starts[0] + this.windowMs - now);
		}
	}
}
