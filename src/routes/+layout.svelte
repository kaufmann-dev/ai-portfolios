<script lang="ts">
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';
	import favicon from '#lib/assets/favicon.svg';
	import AppHeader from '#lib/components/app-header.svelte';
	import { Toaster } from '#lib/components/ui/sonner/index.js';

	let { data, children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>AI Portfolios</title>
</svelte:head>

<ModeWatcher />
<Toaster />
{#if data.user}
	<AppHeader user={data.user} />
{/if}
<main class="mx-auto max-w-6xl px-4 py-8">
	{@render children()}
</main>
