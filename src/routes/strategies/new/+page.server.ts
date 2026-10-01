import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { strategySchema } from '#lib/schemas.js';
import { failWithServiceError } from '#lib/server/forms.js';
import { createStrategy } from '#lib/server/services/strategies.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	form: await superValidate(zod4(strategySchema))
});

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await superValidate(request, zod4(strategySchema));
		if (!form.valid) return fail(400, { form });
		let slug: string;
		try {
			slug = (await createStrategy(form.data)).slug;
		} catch (error) {
			return failWithServiceError(form, error);
		}
		redirect(303, `/strategies/${slug}`);
	}
};
