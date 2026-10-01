<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import { formatDate, formatDateTime } from '#lib/format.js';
	import type { ExecutedRebalanceView } from '#lib/server/services/portfolios.js';
	import OrdersTable from './orders-table.svelte';
	import Rationale from './rationale.svelte';

	let { history }: { history: ExecutedRebalanceView[] } = $props();
</script>

{#if history.length === 0}
	<p class="text-sm text-muted-foreground">No executed rebalances yet.</p>
{:else}
	<ol class="flex flex-col divide-y border-y">
		{#each history as rebalance (rebalance.id)}
			<li>
				<Collapsible.Root>
					<Collapsible.Trigger
						class="group flex w-full items-center gap-2 py-3 text-left hover:bg-muted/50"
					>
						<ChevronRight class="size-4 shrink-0 group-data-[state=open]:rotate-90" />
						<span class="font-medium">{formatDate(rebalance.effectiveDate)}</span>
						<span class="min-w-0 truncate text-sm text-muted-foreground">
							{rebalance.orders.length}
							{rebalance.orders.length === 1 ? 'order' : 'orders'} · {rebalance.positions.length}
							{rebalance.positions.length === 1 ? 'position' : 'positions'}
							{#if rebalance.strategy}· {rebalance.strategy.name}{/if}
						</span>
					</Collapsible.Trigger>
					<Collapsible.Content class="flex flex-col gap-3 pb-4 pl-6">
						<p class="text-sm text-muted-foreground">
							Submitted {formatDateTime(rebalance.submittedAt)}; filled at the
							{formatDate(rebalance.effectiveDate)} close.
						</p>
						<OrdersTable orders={rebalance.orders} prices />
						<Rationale text={rebalance.rationale} strategy={null} />
					</Collapsible.Content>
				</Collapsible.Root>
			</li>
		{/each}
	</ol>
{/if}
