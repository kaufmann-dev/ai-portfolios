<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import PortfolioForm from '#lib/components/portfolio-form.svelte';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { portfolioSchema } from '#lib/schemas.js';

	let { data }: { data: SuperValidated<Infer<typeof portfolioSchema>> } = $props();
</script>

<Dialog.Root>
	<Dialog.Trigger class={buttonVariants()}>
		<Plus />
		New portfolio
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New portfolio</Dialog.Title>
			<Dialog.Description>
				It starts empty. The AI makes the first allocation through the MCP server.
			</Dialog.Description>
		</Dialog.Header>
		<PortfolioForm {data} action="?/create" submitLabel="Create portfolio" />
	</Dialog.Content>
</Dialog.Root>
