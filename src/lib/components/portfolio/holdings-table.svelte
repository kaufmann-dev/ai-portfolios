<script lang="ts">
	import SignedValue from '#lib/components/signed-value.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { formatDate, formatMoney, formatPct, formatPrice, formatShares } from '#lib/format.js';
	import type { HeldPosition } from '#lib/server/services/portfolios.js';
	import PositionReasoning from './position-reasoning.svelte';
	import ReasoningToggle from './reasoning-toggle.svelte';

	let { holdings }: { holdings: HeldPosition[] } = $props();
	let expanded = $state<Record<string, boolean>>({});
</script>

{#if holdings.length === 0}
	<p class="text-sm text-muted-foreground">No open positions.</p>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Ticker</Table.Head>
				<Table.Head>Side</Table.Head>
				<Table.Head>Opened</Table.Head>
				<Table.Head class="text-right">Shares</Table.Head>
				<Table.Head class="text-right">Avg cost</Table.Head>
				<Table.Head class="text-right">Last close</Table.Head>
				<Table.Head class="text-right">Market value</Table.Head>
				<Table.Head class="text-right">Weight</Table.Head>
				<Table.Head class="text-right">Unrealized P&amp;L</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each holdings as h (h.ticker)}
				<Table.Row>
					<Table.Cell class="font-medium">
						<ReasoningToggle
							label={h.ticker}
							controls="holding-{h.ticker}"
							bind:expanded={() => expanded[h.ticker] ?? false, (v) => (expanded[h.ticker] = v)}
						/>
					</Table.Cell>
					<Table.Cell>
						<Badge variant={h.side === 'long' ? 'secondary' : 'outline'}>
							{h.side === 'long' ? 'Long' : 'Short'}
						</Badge>
					</Table.Cell>
					<Table.Cell>{formatDate(h.openedOn)}</Table.Cell>
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
					<Table.Cell class="tabular text-right">{formatPct(h.weight)}</Table.Cell>
					<Table.Cell class="text-right">
						<SignedValue value={h.unrealizedPnl} kind="money" />
						<span class="block text-xs"><SignedValue value={h.unrealizedPct} /></span>
					</Table.Cell>
				</Table.Row>
				{#if expanded[h.ticker]}
					<PositionReasoning id="holding-{h.ticker}" colspan={9} thesis={h.thesis} exit={h.exit} />
				{/if}
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
