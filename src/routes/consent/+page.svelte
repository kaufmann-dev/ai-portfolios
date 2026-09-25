<script lang="ts">
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import { authClient } from '$lib/auth-client';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let { data } = $props();
	let pending = $state<'accept' | 'deny' | null>(null);
	let error = $state<string | null>(null);

	async function decide(accept: boolean) {
		pending = accept ? 'accept' : 'deny';
		error = null;
		const result = await authClient.oauth2.consent({ accept });
		if (result.error || !result.data?.url) {
			error =
				result.error?.message ?? 'The authorization request expired. Start again from the app.';
			pending = null;
			return;
		}
		window.location.assign(result.data.url);
	}
</script>

<svelte:head><title>Authorize {data.client.name} · AI Portfolios</title></svelte:head>

<div class="mx-auto flex max-w-md flex-col gap-6 pt-16">
	<div class="flex flex-col gap-2">
		<ShieldCheck class="size-6" />
		<h1 class="text-2xl font-semibold break-words">
			Allow {data.client.name} to access AI Portfolios?
		</h1>
		{#if data.client.redirectHosts.length}
			<p class="text-sm break-words text-muted-foreground">
				You will be returned to {data.client.redirectHosts.join(', ')}.
			</p>
		{/if}
	</div>

	<div class="flex flex-col gap-2">
		<p class="font-medium">It will be able to:</p>
		<ul class="flex list-disc flex-col gap-1 pl-5">
			{#each data.scopes as item (item.scope)}
				<li>{item.description}</li>
			{/each}
		</ul>
	</div>

	{#if error}
		<Alert.Root variant="destructive">
			<Alert.Title class="wrap-anywhere">{error}</Alert.Title>
		</Alert.Root>
	{/if}

	<div class="flex flex-wrap justify-end gap-3">
		<Button variant="outline" onclick={() => decide(false)} disabled={pending !== null}>
			{#if pending === 'deny'}<Spinner aria-label="Denying" />{/if}
			Deny
		</Button>
		<Button onclick={() => decide(true)} disabled={pending !== null}>
			{#if pending === 'accept'}<Spinner aria-label="Allowing" />{/if}
			Allow
		</Button>
	</div>
	<p class="text-xs text-muted-foreground">
		You can revoke access at any time under Settings → Connected apps.
	</p>
</div>
