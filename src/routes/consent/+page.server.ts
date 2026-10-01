import { error } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.js';
import { MCP_SCOPES } from '#lib/server/mcp/scopes.js';
import type { PageServerLoad } from './$types';

const IDENTITY_SCOPES: Record<string, string> = {
	openid: 'Confirm your identity',
	profile: 'See your name',
	email: 'See your email address',
	offline_access: 'Stay connected without asking you to sign in again'
};

export const load: PageServerLoad = async ({ url, request }) => {
	const clientId = url.searchParams.get('client_id');
	if (!clientId || !url.searchParams.has('sig'))
		error(400, 'This authorization request is incomplete or has expired.');
	const client = await auth.api
		.getOAuthClientPublic({ query: { client_id: clientId }, headers: request.headers })
		.catch(() => null);
	if (!client) error(400, 'Unknown application.');

	const descriptions: Record<string, string> = { ...IDENTITY_SCOPES, ...MCP_SCOPES };
	const scopes = (url.searchParams.get('scope') ?? '')
		.split(' ')
		.filter(Boolean)
		.map((scope) => ({ scope, description: descriptions[scope] ?? scope }));
	const redirectHosts = [
		...new Set(
			(client.redirect_uris ?? []).flatMap((uri: string) => {
				try {
					return [new URL(uri).host];
				} catch {
					return [];
				}
			})
		)
	];

	return {
		client: {
			name: client.client_name ?? clientId,
			uri: client.client_uri ?? null,
			redirectHosts
		},
		scopes
	};
};
