<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDateTime } from '#lib/format.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.strategy.name} v{data.strategy.version} · AI Portfolios</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<a
		href={resolve('/strategies/[slug]', { slug: data.strategy.slug })}
		class="text-sm text-muted-foreground hover:text-foreground">← {data.strategy.name}</a
	>

	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold">
			{data.strategy.name}
			<span class="text-base font-normal text-muted-foreground">v{data.strategy.version}</span>
		</h1>
		<p class="text-sm text-muted-foreground">
			Saved {formatDateTime(data.strategy.versionCreatedAt)}.
			{#if data.strategy.version === data.strategy.latestVersion}
				This is the current version.
			{:else}
				Read-only; the current version is v{data.strategy.latestVersion}.
			{/if}
		</p>
	</div>

	<pre class="border p-4 font-mono text-sm wrap-anywhere whitespace-pre-wrap">{data.strategy
			.content}</pre>
</div>
