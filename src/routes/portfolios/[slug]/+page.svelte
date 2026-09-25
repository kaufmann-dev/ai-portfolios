<script lang="ts">
	import HistoryList from '$lib/components/portfolio/history-list.svelte';
	import HoldingsTable from '$lib/components/portfolio/holdings-table.svelte';
	import MetricsGrid from '$lib/components/portfolio/metrics-grid.svelte';
	import PendingBanner from '$lib/components/portfolio/pending-banner.svelte';
	import PerformanceChart from '$lib/components/portfolio/performance-chart.svelte';
	import PortfolioSettings from '$lib/components/portfolio/portfolio-settings.svelte';
	import * as Alert from '$lib/components/ui/alert';

	let { data, form } = $props();
	const view = $derived(data.view);
	const allocated = $derived(view.metrics.asOf !== null);
</script>

<svelte:head><title>{view.portfolio.name} · AI Portfolios</title></svelte:head>

<div class="flex flex-col gap-8">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			<h1 class="truncate text-2xl font-semibold">{view.portfolio.name}</h1>
			<p class="text-sm text-muted-foreground">
				MCP identifier <code>{view.portfolio.slug}</code>
			</p>
			{#if view.portfolio.description}
				<p class="max-w-prose text-muted-foreground">{view.portfolio.description}</p>
			{/if}
		</div>
		<PortfolioSettings data={data.form} name={view.portfolio.name} />
	</div>

	{#if form && 'message' in form && form.message}
		<Alert.Root variant="destructive">
			<Alert.Title>{form.message}</Alert.Title>
		</Alert.Root>
	{/if}

	{#each view.pending as pending (pending.id)}
		<PendingBanner {pending} />
	{/each}

	{#if view.unpriced.length}
		<Alert.Root variant="destructive">
			<Alert.Title>No price data for {view.unpriced.join(', ')}</Alert.Title>
			<Alert.Description>These positions could not be filled and are excluded.</Alert.Description>
		</Alert.Root>
	{/if}

	{#if !allocated && view.pending.length === 0}
		<p class="text-muted-foreground">
			This portfolio has no positions yet. Ask your AI to make the first allocation with the MCP
			tool <code>submit_portfolio</code>.
		</p>
	{/if}

	{#if allocated}
		<section class="flex flex-col gap-4" aria-labelledby="performance">
			<h2 id="performance" class="text-lg font-semibold">Performance</h2>
			<MetricsGrid metrics={view.metrics} />
			<PerformanceChart series={view.series} />
		</section>

		<section class="flex flex-col gap-4" aria-labelledby="holdings">
			<h2 id="holdings" class="text-lg font-semibold">Holdings</h2>
			<HoldingsTable holdings={view.holdings} />
		</section>

		<section class="flex flex-col gap-4" aria-labelledby="history">
			<h2 id="history" class="text-lg font-semibold">Rebalance history</h2>
			<HistoryList history={view.history} />
		</section>
	{/if}
</div>
