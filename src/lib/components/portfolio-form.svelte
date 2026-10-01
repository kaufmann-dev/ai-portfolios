<script lang="ts">
	import { fromAction } from 'svelte/attachments';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { portfolioSchema } from '#lib/schemas.js';

	let {
		data,
		action,
		submitLabel,
		onsaved
	}: {
		data: SuperValidated<Infer<typeof portfolioSchema>>;
		action: string;
		submitLabel: string;
		onsaved?: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	const form = superForm(data, {
		validators: zod4Client(portfolioSchema),
		resetForm: false,
		onUpdated: ({ form }) => {
			if (form.valid) onsaved?.();
		}
	});
	const { form: formData, enhance, submitting } = form;
</script>

<form method="POST" {action} {@attach fromAction(enhance)} class="flex min-w-0 flex-col gap-4">
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
		<Form.Description>The AI refers to the portfolio by this identifier.</Form.Description>
		<Form.FieldErrors />
	</Form.Field>
	<Form.Field {form} name="description">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>Description</Form.Label>
				<Textarea {...props} bind:value={$formData.description} rows={3} />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
	<Form.Button disabled={$submitting} class="self-end">{submitLabel}</Form.Button>
</form>
