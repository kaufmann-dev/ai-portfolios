<script lang="ts">
	import SignedValue from '#lib/components/signed-value.svelte';
	import { formatDate, formatMoney, formatPct, formatRatio } from '#lib/format.js';
	import type { Metrics } from '#lib/server/portfolio/valuation.js';

	let { metrics }: { metrics: Metrics } = $props();
</script>

<div class="flex flex-col gap-2">
	<dl class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
		<div>
			<dt class="text-sm text-muted-foreground">Total return</dt>
			<dd class="text-2xl font-semibold"><SignedValue value={metrics.totalReturn} /></dd>
		</div>
		<div>
			<dt class="text-sm text-muted-foreground">Last day</dt>
			<dd class="text-2xl font-semibold"><SignedValue value={metrics.lastDayReturn} /></dd>
		</div>
		<div>
			<dt class="text-sm text-muted-foreground">P&amp;L</dt>
			<dd class="text-2xl font-semibold"><SignedValue value={metrics.cumPnl} kind="money" /></dd>
		</div>
		<div>
			<dt class="text-sm text-muted-foreground">Max drawdown</dt>
			<dd class="tabular text-2xl font-semibold">{formatPct(metrics.maxDrawdown)}</dd>
		</div>
		<div>
			<dt class="text-sm text-muted-foreground">Volatility · Sharpe</dt>
			<dd class="tabular text-2xl font-semibold">
				{metrics.annualizedVolatility === null ? '—' : formatPct(metrics.annualizedVolatility)}
				· {formatRatio(metrics.sharpe)}
			</dd>
		</div>
		<div>
			<dt class="text-sm text-muted-foreground">Long</dt>
			<dd class="tabular">{formatMoney(metrics.longExposure)}</dd>
		</div>
		<div>
			<dt class="text-sm text-muted-foreground">Short</dt>
			<dd class="tabular">{formatMoney(metrics.shortExposure)}</dd>
		</div>
		<div>
			<dt class="text-sm text-muted-foreground">Gross</dt>
			<dd class="tabular">{formatMoney(metrics.grossExposure)}</dd>
		</div>
		<div>
			<dt class="text-sm text-muted-foreground">Net</dt>
			<dd class="tabular">{formatMoney(metrics.netExposure)}</dd>
		</div>
		<div>
			<dt class="text-sm text-muted-foreground">As of close</dt>
			<dd>{metrics.asOf ? formatDate(metrics.asOf) : '—'}</dd>
		</div>
	</dl>
	<p class="text-xs text-muted-foreground">
		Returns are daily P&amp;L divided by the previous close's gross exposure (longs plus shorts),
		compounded. Volatility and Sharpe are annualized.
	</p>
</div>
