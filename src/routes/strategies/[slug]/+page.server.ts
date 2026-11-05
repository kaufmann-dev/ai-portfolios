import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { strategySchema } from '#lib/schemas.js';
import { failWithServiceError } from '#lib/server/forms.js';
import {
	deleteStrategy,
	findStrategy,
	listVersions,
	updateStrategy
} from '#lib/server/services/strategies.js';
import type { Actions, PageServerLoad } from './$types';

async function strategyOr404(slug: string) {
	const strategy = await findStrategy(slug);
	if (!strategy) error(404, 'Strategy not found');
	return strategy;
}

export const load: PageServerLoad = async ({ params }) => {
	const strategy = await strategyOr404(params.slug);
	return {
		strategy,
		versions: await listVersions(strategy.id),
		form: await superValidate(
			{ name: strategy.name, slug: strategy.slug, content: strategy.content },
			zod4(strategySchema)
		)
	};
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const strategy = await strategyOr404(params.slug);
		const form = await superValidate(request, zod4(strategySchema));
		if (!form.valid) return fail(400, { form });
		let updated: Awaited<ReturnType<typeof updateStrategy>>;
		try {
			updated = await updateStrategy(strategy.id, form.data);
		} catch (e) {
			return failWithServiceError(form, e);
		}
		if (updated.slug !== params.slug) redirect(303, `/strategies/${updated.slug}`);
		return message(
			form,
			updated.version > strategy.version ? `Saved as v${updated.version}.` : 'Saved.'
		);
	},
	delete: async ({ params }) => {
		const strategy = await strategyOr404(params.slug);
		await deleteStrategy(strategy.id);
		redirect(303, '/strategies');
	}
};
