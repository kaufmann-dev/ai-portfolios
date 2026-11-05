import { error } from '@sveltejs/kit';
import { findStrategy } from '#lib/server/services/strategies.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const version = Number(params.version);
	if (!Number.isInteger(version) || version < 1) error(404, 'Version not found');
	const strategy = await findStrategy(params.slug, version);
	if (!strategy) error(404, 'Version not found');
	return { strategy };
};
