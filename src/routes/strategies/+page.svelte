<script lang="ts">
	import { resolve } from '$app/paths';
	import Plus from '@lucide/svelte/icons/plus';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as Table from '$lib/components/ui/table';
	import { formatDateTime } from '$lib/format';

	let { data } = $props();
</script>

<svelte:head><title>Strategies · AI Portfolios</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl font-semibold">Strategies</h1>
			<p class="text-sm text-muted-foreground">
				Your AI reads these with the MCP tools <code>list_strategies</code> and
				<code>get_strategy</code>.
			</p>
		</div>
		{#if data.strategies.length}
			<Button href={resolve('/strategies/new')}><Plus />New strategy</Button>
		{/if}
	</div>

	{#if data.strategies.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><ScrollText /></Empty.Media>
				<Empty.Title>No strategies yet</Empty.Title>
				<Empty.Description>
					Write a strategy once and tell your AI to use it, for example: “use strategy momentum-v1
					from the MCP server”.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button href={resolve('/strategies/new')}><Plus />New strategy</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Slug</Table.Head>
					<Table.Head>Updated</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.strategies as strategy (strategy.id)}
					<Table.Row>
						<Table.Cell class="max-w-64">
							<a
								href={resolve('/strategies/[slug]', { slug: strategy.slug })}
								class="block truncate font-medium hover:underline"
							>
								{strategy.name}
							</a>
						</Table.Cell>
						<Table.Cell><code>{strategy.slug}</code></Table.Cell>
						<Table.Cell class="text-muted-foreground">
							{formatDateTime(strategy.updatedAt)}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>
