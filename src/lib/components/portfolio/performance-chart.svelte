<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { LineChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import { formatSignedPct } from '$lib/format';
	import type { SeriesPoint } from '$lib/server/portfolio/valuation';

	let { series }: { series: SeriesPoint[] } = $props();

	const data = $derived(
		series.map((p) => ({ date: new Date(`${p.date}T00:00:00Z`), totalReturn: p.index - 1 }))
	);
	const config = {
		totalReturn: { label: 'Total return', color: 'var(--foreground)' }
	} satisfies Chart.ChartConfig;
	const dateLabel = (d: Date) =>
		d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
</script>

{#if data.length < 2}
	<p class="text-sm text-muted-foreground">
		The chart appears after the portfolio has been valued at two closes.
	</p>
{:else}
	<Chart.Container {config} class="aspect-auto h-64 w-full">
		<LineChart
			{data}
			x="date"
			xScale={scaleUtc()}
			padding={{ left: 56, bottom: 24, top: 8, right: 8 }}
			series={[{ key: 'totalReturn', label: 'Total return', color: config.totalReturn.color }]}
			props={{
				// One tick per session for short histories; otherwise let the scale choose.
				xAxis: { format: dateLabel, ticks: data.length <= 8 ? data.map((d) => d.date) : 6 },
				yAxis: { format: (v: number) => formatSignedPct(v) }
			}}
		>
			{#snippet tooltip()}
				<Chart.Tooltip labelFormatter={(v: Date) => dateLabel(v)} indicator="line">
					{#snippet formatter({ value })}
						<span class="tabular">{formatSignedPct(Number(value))}</span>
					{/snippet}
				</Chart.Tooltip>
			{/snippet}
		</LineChart>
	</Chart.Container>
{/if}
