<script lang="ts">
	import { enhance } from '$app/forms';
	import CopyField from '$lib/components/copy-field.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { formatDateTime } from '$lib/format';

	let { data } = $props();

	const claudeCode = $derived(`claude mcp add --transport http ai-portfolios ${data.mcpUrl}`);
	const codex = $derived(`codex mcp add ai-portfolios --url ${data.mcpUrl}`);
</script>

<svelte:head><title>Settings · AI Portfolios</title></svelte:head>

<div class="flex flex-col gap-10">
	<h1 class="text-2xl font-semibold">Settings</h1>

	<section class="flex flex-col gap-4" aria-labelledby="mcp">
		<div class="flex flex-col gap-1">
			<h2 id="mcp" class="text-lg font-semibold">MCP server</h2>
			<p class="max-w-prose text-sm text-muted-foreground">
				Add this URL as a remote MCP server (Streamable HTTP). The client opens a browser window
				where you sign in with Pocket ID and approve its access. No API key is needed.
			</p>
		</div>
		<CopyField value={data.mcpUrl} label="MCP URL" />
		<dl class="grid grid-cols-1 gap-4 text-sm">
			<div class="flex flex-col gap-2">
				<dt class="font-medium">Claude Code</dt>
				<dd class="flex flex-col gap-2">
					<CopyField value={claudeCode} label="Claude Code command" />
					<span class="text-muted-foreground"
						>Then run <code>/mcp</code> and choose Authenticate.</span
					>
				</dd>
			</div>
			<div class="flex flex-col gap-2">
				<dt class="font-medium">Codex</dt>
				<dd class="flex flex-col gap-2">
					<CopyField value={codex} label="Codex command" />
					<span class="text-muted-foreground"
						>Then run <code>codex mcp login ai-portfolios</code>.</span
					>
				</dd>
			</div>
			<div class="flex flex-col gap-1">
				<dt class="font-medium">Claude (web and desktop)</dt>
				<dd class="text-muted-foreground">
					Settings → Connectors → Add custom connector, then paste the MCP URL.
				</dd>
			</div>
			<div class="flex flex-col gap-1">
				<dt class="font-medium">ChatGPT</dt>
				<dd class="text-muted-foreground">
					Settings → Apps &amp; Connectors → Advanced settings → enable Developer mode, then create
					a connector with the MCP URL and OAuth authentication.
				</dd>
			</div>
		</dl>
	</section>

	<section class="flex flex-col gap-4" aria-labelledby="apps">
		<div class="flex flex-col gap-1">
			<h2 id="apps" class="text-lg font-semibold">Connected apps</h2>
			<p class="max-w-prose text-sm text-muted-foreground">
				Revoking stops the app from refreshing its access; any token it already holds expires within
				15 minutes.
			</p>
		</div>
		{#if data.apps.length === 0}
			<p class="text-sm text-muted-foreground">No apps have been authorized yet.</p>
		{:else}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>App</Table.Head>
						<Table.Head>Access</Table.Head>
						<Table.Head>Authorized</Table.Head>
						<Table.Head><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.apps as app (app.clientId)}
						<Table.Row>
							<Table.Cell class="max-w-56">
								<span class="block truncate font-medium">{app.name}</span>
								{#if app.uri}
									<span class="block truncate text-xs text-muted-foreground">{app.uri}</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-sm">{app.scopes.join(', ')}</Table.Cell>
							<Table.Cell>{formatDateTime(app.grantedAt)}</Table.Cell>
							<Table.Cell class="text-right">
								<AlertDialog.Root>
									<AlertDialog.Trigger
										class={buttonVariants({ variant: 'destructive', size: 'sm' })}
									>
										Revoke
									</AlertDialog.Trigger>
									<AlertDialog.Content>
										<AlertDialog.Header>
											<AlertDialog.Title>Revoke {app.name}?</AlertDialog.Title>
											<AlertDialog.Description>
												It will need your approval again to use the MCP server.
											</AlertDialog.Description>
										</AlertDialog.Header>
										<AlertDialog.Footer>
											<AlertDialog.Cancel>Keep access</AlertDialog.Cancel>
											<form method="POST" action="?/revoke" use:enhance>
												<input type="hidden" name="clientId" value={app.clientId} />
												<AlertDialog.Action
													type="submit"
													class={buttonVariants({ variant: 'destructive' })}
												>
													Revoke
												</AlertDialog.Action>
											</form>
										</AlertDialog.Footer>
									</AlertDialog.Content>
								</AlertDialog.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</section>
</div>
