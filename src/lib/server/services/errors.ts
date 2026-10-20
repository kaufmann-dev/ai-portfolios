/** A failure whose message is safe and useful to show to the user or the AI client. */
export class ServiceError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 404 | 409 | 503 = 400
	) {
		super(message);
	}
}
