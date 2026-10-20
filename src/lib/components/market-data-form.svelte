<script lang="ts">
	import { fromAction } from 'svelte/attachments';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as RadioGroup from '#lib/components/ui/radio-group/index.js';
	import { settingsSchema } from '#lib/schemas.js';

	let { data }: { data: SuperValidated<Infer<typeof settingsSchema>> } = $props();

	// svelte-ignore state_referenced_locally
	const form = superForm(data, { validators: zod4Client(settingsSchema), resetForm: false });
	const { form: formData, enhance, submitting, message } = form;

	const plans = [
		{
			value: 'basic',
			label: 'Basic (free)',
			hint: 'End-of-day prices, 5 requests per minute. Prices are the latest close.'
		},
		{
			value: 'starter',
			label: 'Starter or higher',
			hint: 'Delayed or real-time snapshot prices, no request limit.'
		}
	] as const;
</script>

<form method="POST" action="?/plan" {@attach fromAction(enhance)} class="flex flex-col gap-4">
	<Form.Fieldset {form} name="massivePlan" class="flex flex-col gap-3">
		<Form.Legend>Massive plan</Form.Legend>
		<RadioGroup.Root bind:value={$formData.massivePlan} name="massivePlan" class="gap-3">
			{#each plans as plan (plan.value)}
				<Form.Control>
					{#snippet children({ props })}
						<div class="flex items-start gap-3">
							<RadioGroup.Item value={plan.value} {...props} class="mt-0.5" />
							<div class="flex flex-col gap-1">
								<Form.Label class="font-medium">{plan.label}</Form.Label>
								<span class="text-sm text-muted-foreground">{plan.hint}</span>
							</div>
						</div>
					{/snippet}
				</Form.Control>
			{/each}
		</RadioGroup.Root>
		<Form.Description>Must match the plan of <code>MASSIVE_API_KEY</code>.</Form.Description>
		<Form.FieldErrors />
	</Form.Fieldset>
	<div class="flex items-center gap-4">
		<Form.Button disabled={$submitting}>Save</Form.Button>
		{#if $message}
			<p class="text-sm text-muted-foreground" role="status">{$message}</p>
		{/if}
	</div>
</form>
