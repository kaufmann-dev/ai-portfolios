import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { portfolioSchema } from '#lib/schemas.js';
import { failMessage, failWithServiceError } from '#lib/server/forms.js';
import { ServiceError } from '#lib/server/services/errors.js';
import {
	cancelPendingRebalance,
	deletePortfolio,
	getPortfolio,
	getPortfolioView,
	resetPortfolio,
	updatePortfolio
} from '#lib/server/services/portfolios.js';
import type { Actions, PageServerLoad } from './$types';

async function portfolioOr404(slug: string) {
	try {
		return await getPortfolio(slug);
	} catch (e) {
		if (e instanceof ServiceError && e.status === 404) error(404, 'Portfolio not found');
		throw e;
	}
}

export const load: PageServerLoad = async ({ params }) => {
	const portfolio = await portfolioOr404(params.slug);
	if (portfolio.slug !== params.slug) redirect(308, `/portfolios/${portfolio.slug}`);
	const view = await getPortfolioView(portfolio.slug);
	const form = await superValidate(
		{ name: portfolio.name, slug: portfolio.slug, description: portfolio.description },
		zod4(portfolioSchema)
	);
	return { view, form };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const portfolio = await portfolioOr404(params.slug);
		const form = await superValidate(request, zod4(portfolioSchema));
		if (!form.valid) return fail(400, { form });
		let slug: string;
		try {
			slug = (await updatePortfolio(portfolio.id, form.data)).slug;
		} catch (e) {
			return failWithServiceError(form, e);
		}
		if (slug !== params.slug) redirect(303, `/portfolios/${slug}`);
		return { form };
	},
	reset: async ({ params }) => {
		const portfolio = await portfolioOr404(params.slug);
		await resetPortfolio(portfolio.id);
		return { reset: true };
	},
	delete: async ({ params }) => {
		const portfolio = await portfolioOr404(params.slug);
		await deletePortfolio(portfolio.id);
		redirect(303, '/');
	},
	cancel: async ({ request, params }) => {
		const portfolio = await portfolioOr404(params.slug);
		const rebalanceId = Number((await request.formData()).get('rebalanceId'));
		if (!Number.isInteger(rebalanceId)) return fail(400, { message: 'Missing rebalance.' });
		try {
			await cancelPendingRebalance(portfolio.id, rebalanceId);
		} catch (e) {
			return failMessage(e);
		}
		return { cancelled: true };
	}
};
