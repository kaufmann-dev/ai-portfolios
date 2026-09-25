<script lang="ts">
	import { resolve } from '$app/paths';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import NewPortfolioDialog from '$lib/components/new-portfolio-dialog.svelte';
	import SignedValue from '$lib/components/signed-value.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Empty from '$lib/components/ui/empty';
	import * as Table from '$lib/components/ui/table';
	import { formatDate, formatMoney } from '$lib/format';

	let { data } = $props();
</script>

<svelte:head><title>Portfolios · AI Portfolios</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<h1 class="text-2xl font-semibold">Portfolios</h1>
		{#if data.summaries.length}
			<NewPortfolioDialog data={data.form} />
		{/if}
	</div>

	{#if data.summaries.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><Briefcase /></Empty.Media>
				<Empty.Title>No portfolios yet</Empty.Title>
				<Empty.Description>
					Create one here, or let your AI create it with the MCP tool
					<code>create_portfolio</code>.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<NewPortfolioDialog data={data.form} />
			</Empty.Content>
		</Empty.Root>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Portfolio</Table.Head>
					<Table.Head class="text-right">Total return</Table.Head>
					<Table.Head class="text-right">Last day</Table.Head>
					<Table.Head class="text-right">P&amp;L</Table.Head>
					<Table.Head class="text-right">Gross exposure</Table.Head>
					<Table.Head class="text-right">Positions</Table.Head>
					<Table.Head>Status</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.summaries as summary (summary.portfolio.id)}
					{@const open = summary.pending.find((p) => p.state === 'open')}
					{@const awaiting = summary.pending.some((p) => p.state === 'awaiting_prices')}
					<Table.Row>
						<Table.Cell class="max-w-64">
							<a
								href={resolve('/portfolios/[slug]', { slug: summary.portfolio.slug })}
								class="block truncate font-medium hover:underline"
							>
								{summary.portfolio.name}
							</a>
						</Table.Cell>
						<Table.Cell class="text-right"
							><SignedValue value={summary.metrics.totalReturn} /></Table.Cell
						>
						<Table.Cell class="text-right"
							><SignedValue value={summary.metrics.lastDayReturn} /></Table.Cell
						>
						<Table.Cell class="text-right">
							<SignedValue value={summary.metrics.cumPnl} kind="money" />
						</Table.Cell>
						<Table.Cell class="tabular text-right">
							{formatMoney(summary.metrics.grossExposure)}
						</Table.Cell>
						<Table.Cell class="tabular text-right">{summary.positions}</Table.Cell>
						<Table.Cell>
							{#if open}
								<Badge variant="outline" class="border-pending text-pending">
									Orders due {formatDate(open.effectiveDate)}
								</Badge>
							{:else if awaiting}
								<Badge variant="outline">Awaiting closing prices</Badge>
							{:else if summary.metrics.asOf === null}
								<span class="text-muted-foreground">Not allocated</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>
