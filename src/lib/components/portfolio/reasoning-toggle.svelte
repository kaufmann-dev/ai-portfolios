<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let {
		label,
		controls,
		expanded = $bindable(false)
	}: { label: string; controls: string; expanded?: boolean } = $props();
</script>

<button
	type="button"
	class="flex items-center gap-1"
	aria-expanded={expanded}
	aria-controls={controls}
	onclick={() => (expanded = !expanded)}
>
	<ChevronRight class={['size-4', expanded && 'rotate-90']} />
	{label}
</button>
