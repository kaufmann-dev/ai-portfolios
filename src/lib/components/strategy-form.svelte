<script lang="ts">
	import { fromAction } from 'svelte/attachments';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { strategySchema } from '#lib/schemas.js';

	let {
		data,
		action,
		submitLabel
	}: {
		data: SuperValidated<Infer<typeof strategySchema>>;
		action: string;
		submitLabel: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	const form = superForm(data, { validators: zod4Client(strategySchema), resetForm: false });
	const { form: formData, enhance, submitting, message } = form;
</script>

<form method="POST" {action} {@attach fromAction(enhance)} class="flex flex-col gap-4">
	<div class="grid gap-4 sm:grid-cols-2">
		<Form.Field {form} name="name">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>Name</Form.Label>
					<Input {...props} bind:value={$formData.name} autocomplete="off" />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Form.Field {form} name="slug">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>Slug</Form.Label>
					<Input {...props} bind:value={$formData.slug} placeholder="Derived from the name" />
				{/snippet}
			</Form.Control>
			<Form.Description>Tell the AI to fetch the strategy by this identifier.</Form.Description>
			<Form.FieldErrors />
		</Form.Field>
	</div>
	<Form.Field {form} name="content">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>Strategy</Form.Label>
				<Textarea
					{...props}
					bind:value={$formData.content}
					rows={20}
					class="font-mono text-sm"
					placeholder="Objective, universe, position sizing, rebalancing rules, risk limits…"
				/>
			{/snippet}
		</Form.Control>
		<Form.Description>Plain text or Markdown. The AI receives it verbatim.</Form.Description>
		<Form.FieldErrors />
	</Form.Field>
	<div class="flex items-center justify-end gap-4">
		{#if $message}
			<p class="text-sm text-muted-foreground" role="status">{$message}</p>
		{/if}
		<Form.Button disabled={$submitting}>{submitLabel}</Form.Button>
	</div>
</form>
