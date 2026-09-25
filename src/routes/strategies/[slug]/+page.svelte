<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import StrategyForm from '$lib/components/strategy-form.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { buttonVariants } from '$lib/components/ui/button';

	let { data } = $props();
</script>

<svelte:head><title>{data.strategy.name} · AI Portfolios</title></svelte:head>

<div class="flex flex-col gap-6">
	<a href={resolve('/strategies')} class="text-sm text-muted-foreground hover:text-foreground"
		>← Strategies</a
	>
	<div class="flex flex-wrap items-center justify-between gap-4">
		<h1 class="min-w-0 truncate text-2xl font-semibold">{data.strategy.name}</h1>
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
</div>
