<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import { formatPrice, formatShares, ORDER_LABELS } from '$lib/format';
	import type { Order } from '$lib/server/portfolio/types';

	let { orders, prices }: { orders: (Order & { price?: number | null })[]; prices?: boolean } =
		$props();
</script>

{#if orders.length === 0}
	<p class="text-sm text-muted-foreground">No orders: the target matches the current holdings.</p>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Action</Table.Head>
				<Table.Head>Ticker</Table.Head>
				<Table.Head class="text-right">Shares</Table.Head>
				{#if prices}
					<Table.Head class="text-right">Fill price</Table.Head>
				{/if}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each orders as order (`${order.action}-${order.ticker}`)}
				<Table.Row>
					<Table.Cell>{ORDER_LABELS[order.action]}</Table.Cell>
					<Table.Cell class="font-medium">{order.ticker}</Table.Cell>
					<Table.Cell class="tabular text-right">{formatShares(order.shares)}</Table.Cell>
					{#if prices}
						<Table.Cell class="tabular text-right">
							{order.price == null ? '—' : formatPrice(order.price)}
						</Table.Cell>
					{/if}
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
