<script lang="ts">
	import { enhance } from '$app/forms';
	import BellRing from '@lucide/svelte/icons/bell-ring';
	import Hourglass from '@lucide/svelte/icons/hourglass';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { formatDate, formatDateTime } from '$lib/format';
	import type { PendingRebalance } from '$lib/server/services/portfolios';
	import OrdersTable from './orders-table.svelte';
	import Rationale from './rationale.svelte';

	let { pending }: { pending: PendingRebalance } = $props();
</script>

<Alert.Root class={pending.state === 'open' ? 'border-pending' : ''}>
	{#if pending.state === 'open'}
		<BellRing class="text-pending" />
		<Alert.Title>
			Place these orders before the close on {formatDate(pending.effectiveDate)},
			{pending.closeTimeEt} ET
		</Alert.Title>
	{:else}
		<Hourglass />
		<Alert.Title>
			The close on {formatDate(pending.effectiveDate)} has passed. Waiting for closing prices.
		</Alert.Title>
	{/if}
	<Alert.Description class="flex flex-col gap-3">
		<span>
			Submitted {formatDateTime(pending.submittedAt)}. These orders fill at the
			{formatDate(pending.effectiveDate)} closing prices.
		</span>
		<div class="w-full text-foreground">
			<OrdersTable orders={pending.orders} />
		</div>
		<Rationale text={pending.rationale} strategy={pending.strategy} />
		{#if pending.state === 'open'}
			<form method="POST" action="?/cancel" use:enhance>
				<input type="hidden" name="rebalanceId" value={pending.id} />
				<Button type="submit" variant="outline" size="sm">Cancel this rebalance</Button>
			</form>
		{/if}
	</Alert.Description>
</Alert.Root>
