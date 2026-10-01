import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	ORIGIN: { schema: (input) => input },
	BETTER_AUTH_SECRET: { schema: (input) => input },
	POCKET_ID_CLIENT_ID: { schema: (input) => input },
	POCKET_ID_CLIENT_SECRET: { schema: (input) => input },
	POCKET_ID_ISSUER: { schema: (input) => input },
	MASSIVE_API_KEY: { schema: (input) => input },
	DATABASE_URL: { schema: (input) => input },
	REFRESH_INTERVAL_MINUTES: { schema: (input) => input }
});
