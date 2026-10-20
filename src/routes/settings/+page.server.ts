import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { settingsSchema } from '#lib/schemas.js';
import { listConnectedApps, revokeConnectedApp } from '#lib/server/services/connected-apps.js';
import { getMassivePlan, setMassivePlan } from '#lib/server/services/settings.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => ({
	form: await superValidate({ massivePlan: await getMassivePlan() }, zod4(settingsSchema)),
	apps: await listConnectedApps(locals.user.id),
	mcpUrl: `${url.origin}/mcp`
});

export const actions: Actions = {
	plan: async ({ request }) => {
		const form = await superValidate(request, zod4(settingsSchema));
		if (!form.valid) return fail(400, { form });
		await setMassivePlan(form.data.massivePlan);
		return message(form, 'Saved.');
	},
	revoke: async ({ locals, request }) => {
		const clientId = String((await request.formData()).get('clientId') ?? '');
		if (!clientId) return fail(400, { message: 'Missing app.' });
		await revokeConnectedApp(locals.user.id, clientId);
		return { revoked: true };
	}
};
