<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import StrategyForm from '#lib/components/strategy-form.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { formatDateTime } from '#lib/format.js';

	let { data } = $props();
</script>

<svelte:head><title>{data.strategy.name} · AI Portfolios</title></svelte:head>

<div class="flex flex-col gap-6">
	<a href={resolve('strategies')} class="text-sm text-muted-foreground hover:text-foreground"
		>← Strategies</a
	>

	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex min-w-0 items-baseline gap-2">
			<h1 class="truncate text-2xl font-semibold">{data.strategy.name}</h1>
			<span class="text-sm text-muted-foreground">v{data.strategy.version}</span>
		</div>
		<AlertDialog.Root>
			<AlertDialog.Trigger class={buttonVariants({ variant: 'destructive' })}>
				Delete strategy
			</AlertDialog.Trigger>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>Delete {data.strategy.name}?</AlertDialog.Title>
					<AlertDialog.Description>
						Past rebalances keep their history but lose the link to this strategy.
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>Keep it</AlertDialog.Cancel>
					<form method="POST" action="?/delete" use:enhance>
						<AlertDialog.Action type="submit" class={buttonVariants({ variant: 'destructive' })}>
							Delete
						</AlertDialog.Action>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Root>
	</div>
	{#key data.strategy.id}
		<StrategyForm data={data.form} action="?/update" submitLabel="Save strategy" />
	{/key}

	<section class="flex flex-col gap-2">
		<h2 class="text-lg font-semibold">Versions</h2>
		<p class="text-sm text-muted-foreground">
			Saving changed text creates a new version. Each rebalance records the version it was made
			under. Versions appear only here: your AI always reads the latest text, unnumbered.
		</p>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Version</Table.Head>
					<Table.Head>Saved</Table.Head>
					<Table.Head class="text-right">Characters</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.versions as v (v.version)}
					<Table.Row>
						<Table.Cell>
							<a
								href={resolve('/strategies/[slug]/versions/[version]', {
									slug: data.strategy.slug,
									version: String(v.version)
								})}
								class="font-medium hover:underline"
							>
								v{v.version}
							</a>
							{#if v.version === data.strategy.version}
								<span class="text-sm text-muted-foreground">current</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{formatDateTime(v.createdAt)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums"
							>{v.length.toLocaleString('en-US')}</Table.Cell
						>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</section>
</div>
