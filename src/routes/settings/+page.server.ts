import { fail } from '@sveltejs/kit';
import { listConnectedApps, revokeConnectedApp } from '#lib/server/services/connected-apps.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => ({
	apps: await listConnectedApps(locals.user.id),
	mcpUrl: `${url.origin}/mcp`
});

export const actions: Actions = {
	revoke: async ({ locals, request }) => {
		const clientId = String((await request.formData()).get('clientId') ?? '');
		if (!clientId) return fail(400, { message: 'Missing app.' });
		await revokeConnectedApp(locals.user.id, clientId);
		return { revoked: true };
	}
};
