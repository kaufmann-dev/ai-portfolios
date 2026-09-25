<script lang="ts">
	import SignedValue from '$lib/components/signed-value.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import { formatDate, formatPrice } from '$lib/format';
	import type { ClosedPositionView } from '$lib/server/services/portfolios';
	import PositionReasoning from './position-reasoning.svelte';
	import ReasoningToggle from './reasoning-toggle.svelte';

	let { closed }: { closed: ClosedPositionView[] } = $props();
	let expanded = $state<Record<string, boolean>>({});
	const key = (c: ClosedPositionView) => `${c.ticker}-${c.side}-${c.closedOn}`;
</script>

{#if closed.length === 0}
	<p class="text-sm text-muted-foreground">No closed positions yet.</p>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Ticker</Table.Head>
				<Table.Head>Side</Table.Head>
				<Table.Head>Opened</Table.Head>
				<Table.Head>Closed</Table.Head>
				<Table.Head class="text-right">Avg cost</Table.Head>
				<Table.Head class="text-right">Exit price</Table.Head>
				<Table.Head class="text-right">Realized P&amp;L</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each closed as c (key(c))}
				<Table.Row>
					<Table.Cell class="font-medium">
						<ReasoningToggle
							label={c.ticker}
							controls="closed-{key(c)}"
							bind:expanded={() => expanded[key(c)] ?? false, (v) => (expanded[key(c)] = v)}
						/>
					</Table.Cell>
					<Table.Cell>
						<Badge variant={c.side === 'long' ? 'secondary' : 'outline'}>
							{c.side === 'long' ? 'Long' : 'Short'}
						</Badge>
					</Table.Cell>
					<Table.Cell>{formatDate(c.openedOn)}</Table.Cell>
					<Table.Cell>{formatDate(c.closedOn)}</Table.Cell>
					<Table.Cell class="tabular text-right">{formatPrice(c.avgCost)}</Table.Cell>
					<Table.Cell class="tabular text-right">{formatPrice(c.exitPrice)}</Table.Cell>
					<Table.Cell class="text-right">
						<SignedValue value={c.realizedPnl} kind="money" />
						<span class="block text-xs"><SignedValue value={c.realizedPct} /></span>
					</Table.Cell>
				</Table.Row>
				{#if expanded[key(c)]}
					<PositionReasoning id="closed-{key(c)}" colspan={7} thesis={c.thesis} exit={c.exit} />
				{/if}
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
