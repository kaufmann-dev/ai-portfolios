<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as Collapsible from '$lib/components/ui/collapsible';

	let { text, strategy }: { text: string; strategy: { name: string } | null } = $props();
</script>

{#if strategy}
	<p class="text-sm text-muted-foreground">Strategy: {strategy.name}</p>
{/if}
<Collapsible.Root>
	<Collapsible.Trigger class="group flex items-center gap-1 text-sm font-medium">
		<ChevronRight class="size-4 group-data-[state=open]:rotate-90" />
		Rationale
	</Collapsible.Trigger>
	<Collapsible.Content>
		<p class="mt-2 text-sm wrap-anywhere whitespace-pre-wrap">{text}</p>
	</Collapsible.Content>
</Collapsible.Root>
