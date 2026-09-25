import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { strategySchema } from '$lib/schemas';
import { failWithServiceError } from '$lib/server/forms';
import { deleteStrategy, findStrategy, updateStrategy } from '$lib/server/services/strategies';
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
		let slug: string;
		try {
			slug = (await updateStrategy(strategy.id, form.data)).slug;
		} catch (e) {
			return failWithServiceError(form, e);
		}
		if (slug !== params.slug) redirect(303, `/strategies/${slug}`);
		return message(form, 'Saved.');
	},
	delete: async ({ params }) => {
		const strategy = await strategyOr404(params.slug);
		await deleteStrategy(strategy.id);
		redirect(303, '/strategies');
	}
};
