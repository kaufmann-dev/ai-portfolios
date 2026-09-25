<script lang="ts">
	import SignedValue from '$lib/components/signed-value.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import { formatDate, formatMoney, formatPrice, formatShares } from '$lib/format';
	import type { Holding } from '$lib/server/portfolio/valuation';

	let { holdings }: { holdings: Holding[] } = $props();
</script>

{#if holdings.length === 0}
	<p class="text-sm text-muted-foreground">No open positions.</p>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Ticker</Table.Head>
				<Table.Head>Side</Table.Head>
				<Table.Head class="text-right">Shares</Table.Head>
				<Table.Head class="text-right">Avg cost</Table.Head>
				<Table.Head class="text-right">Last close</Table.Head>
				<Table.Head class="text-right">Market value</Table.Head>
				<Table.Head class="text-right">Unrealized P&amp;L</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each holdings as h (h.ticker)}
				<Table.Row>
					<Table.Cell class="font-medium">{h.ticker}</Table.Cell>
					<Table.Cell>
						<Badge variant={h.side === 'long' ? 'secondary' : 'outline'}>
							{h.side === 'long' ? 'Long' : 'Short'}
						</Badge>
					</Table.Cell>
					<Table.Cell class="tabular text-right">{formatShares(h.shares)}</Table.Cell>
					<Table.Cell class="tabular text-right">{formatPrice(h.avgCost)}</Table.Cell>
					<Table.Cell class="tabular text-right">
						{formatPrice(h.lastClose)}
						{#if h.stale}
							<span class="block text-xs text-muted-foreground">
								from {formatDate(h.lastPriceDate)}
							</span>
						{/if}
					</Table.Cell>
					<Table.Cell class="tabular text-right">{formatMoney(h.marketValue)}</Table.Cell>
					<Table.Cell class="text-right">
						<SignedValue value={h.unrealizedPnl} kind="money" />
						<span class="block text-xs"><SignedValue value={h.unrealizedPct} /></span>
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
