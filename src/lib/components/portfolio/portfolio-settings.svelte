<script lang="ts">
	import { enhance } from '$app/forms';
	import Settings from '@lucide/svelte/icons/settings';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import PortfolioForm from '#lib/components/portfolio-form.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import type { portfolioSchema } from '#lib/schemas.js';

	let { data, name }: { data: SuperValidated<Infer<typeof portfolioSchema>>; name: string } =
		$props();
	let open = $state(false);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger class={buttonVariants({ variant: 'outline' })}>
		<Settings />
		Settings
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Portfolio settings</Dialog.Title>
		</Dialog.Header>
		<PortfolioForm {data} action="?/update" submitLabel="Save" onsaved={() => (open = false)} />
		<Separator />
		<div class="flex items-center justify-between gap-4">
			<p class="text-sm text-muted-foreground">Resetting removes all rebalances and history.</p>
			<AlertDialog.Root>
				<AlertDialog.Trigger class={buttonVariants({ variant: 'destructive' })}>
					Reset portfolio
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Reset {name}?</AlertDialog.Title>
						<AlertDialog.Description>
							This permanently deletes every rebalance, including pending ones, and the performance
							history. The portfolio stays, empty, and its next submission becomes its first
							allocation.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>Keep history</AlertDialog.Cancel>
						<form
							method="POST"
							action="?/reset"
							use:enhance={() =>
								async ({ result, update }) => {
									await update();
									if (result.type === 'success') open = false;
								}}
						>
							<AlertDialog.Action type="submit" class={buttonVariants({ variant: 'destructive' })}>
								Reset
							</AlertDialog.Action>
						</form>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</div>
		<div class="flex items-center justify-between gap-4">
			<p class="text-sm text-muted-foreground">Deleting removes all history.</p>
			<AlertDialog.Root>
				<AlertDialog.Trigger class={buttonVariants({ variant: 'destructive' })}>
					Delete portfolio
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Delete {name}?</AlertDialog.Title>
						<AlertDialog.Description>
							This permanently deletes the portfolio, its rebalances, and its performance history.
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
	</Dialog.Content>
</Dialog.Root>
