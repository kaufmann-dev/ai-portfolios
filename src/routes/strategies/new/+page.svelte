<script lang="ts">
	import { resolve } from '$app/paths';
	import StrategyForm from '#lib/components/strategy-form.svelte';

	let { data } = $props();
</script>

<svelte:head><title>New strategy · AI Portfolios</title></svelte:head>

<div class="flex flex-col gap-6">
	<a href={resolve('strategies')} class="text-sm text-muted-foreground hover:text-foreground"
		>← Strategies</a
	>

	<h1 class="text-2xl font-semibold">New strategy</h1>
	<StrategyForm data={data.form} action="" submitLabel="Create strategy" />
</div>
