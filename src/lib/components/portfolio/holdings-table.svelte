<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import SignedValue from '$lib/components/signed-value.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import { formatDate, formatMoney, formatPrice, formatShares } from '$lib/format';
	import type { HeldPosition } from '$lib/server/services/portfolios';

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
					<Table.Cell class="font-medium">
						<button
							type="button"
							class="flex items-center gap-1"
							aria-expanded={expanded[h.ticker] ?? false}
							aria-controls="thesis-{h.ticker}"
							onclick={() => (expanded[h.ticker] = !expanded[h.ticker])}
						>
							<ChevronRight class={['size-4', expanded[h.ticker] && 'rotate-90']} />
							{h.ticker}
						</button>
					</Table.Cell>
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
				{#if expanded[h.ticker]}
					<Table.Row id="thesis-{h.ticker}" class="hover:bg-transparent">
						<Table.Cell colspan={7} class="whitespace-normal">
							<dl class="grid max-w-prose gap-x-4 gap-y-2 pl-5 text-sm sm:grid-cols-[auto_1fr]">
								<dt class="text-muted-foreground">Opened</dt>
								<dd>{formatDate(h.openedOn)}</dd>
								<dt class="text-muted-foreground">Thesis</dt>
								<dd class="whitespace-pre-wrap">{h.thesis}</dd>
								<dt class="text-muted-foreground">Exit plan</dt>
								<dd class="whitespace-pre-wrap">{h.exit}</dd>
							</dl>
						</Table.Cell>
					</Table.Row>
				{/if}
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
