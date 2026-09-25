import { setError, type SuperValidated } from 'sveltekit-superforms';
import { fail } from '@sveltejs/kit';
import { ServiceError } from './services/errors';

/** Maps a ServiceError onto the form (slug conflicts onto the slug field); rethrows anything else. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function failWithServiceError<T extends Record<string, any>>(
	form: SuperValidated<T>,
	error: unknown
) {
	if (!(error instanceof ServiceError)) throw error;
	const field = error.status === 409 && 'slug' in form.data ? 'slug' : '';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return setError(form, field as any, error.message);
}

export function failMessage(error: unknown) {
	if (!(error instanceof ServiceError)) throw error;
	return fail(error.status, { message: error.message });
}
