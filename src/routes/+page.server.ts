import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { portfolioSchema } from '#lib/schemas.js';
import { failWithServiceError } from '#lib/server/forms.js';
import { createPortfolio, listPortfolioSummaries } from '#lib/server/services/portfolios.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	summaries: await listPortfolioSummaries(),
	form: await superValidate(zod4(portfolioSchema))
});

export const actions: Actions = {
	create: async ({ request }) => {
		const form = await superValidate(request, zod4(portfolioSchema));
		if (!form.valid) return fail(400, { form });
		let slug: string;
		try {
			slug = (await createPortfolio(form.data)).slug;
		} catch (error) {
			return failWithServiceError(form, error);
		}
		redirect(303, `/portfolios/${slug}`);
	}
};
