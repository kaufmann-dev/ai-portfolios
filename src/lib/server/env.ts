import * as env from '$app/env/private';

const REQUIRED = [
	'DATABASE_URL',
	'ORIGIN',
	'BETTER_AUTH_SECRET',
	'POCKET_ID_ISSUER',
	'POCKET_ID_CLIENT_ID',
	'POCKET_ID_CLIENT_SECRET',
	'MASSIVE_API_KEY'
] as const;

/** Fails fast at server start. Not called during the build, which has no runtime secrets. */
export function assertEnv(): void {
	const missing = REQUIRED.filter((name) => !env[name]);
	if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}

export function refreshIntervalMs(): number {
	const minutes = Number(env.REFRESH_INTERVAL_MINUTES || 10);
	return (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60_000;
}
