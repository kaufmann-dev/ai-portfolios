import { z } from 'zod';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64);
}

const slug = z
	.string()
	.trim()
	.max(64)
	.regex(SLUG_PATTERN, 'Use lowercase letters, numbers, and single hyphens.');

export const portfolioSchema = z.object({
	name: z.string().trim().min(1, 'Enter a name.').max(100),
	slug: slug.or(z.literal('')).default(''),
	description: z.string().trim().max(2000).default('')
});

export const strategySchema = z.object({
	name: z.string().trim().min(1, 'Enter a name.').max(100),
	slug: slug.or(z.literal('')).default(''),
	content: z.string().trim().min(1, 'Describe the strategy.').max(100_000)
});

export const positionSchema = z.object({
	ticker: z
		.string()
		.trim()
		.min(1)
		.transform((t) => t.toUpperCase())
		.pipe(z.string().regex(TICKER_PATTERN, 'Not a valid ticker symbol.')),
	shares: z.number().int('Shares must be a whole number.').positive('Shares must be at least 1.'),
	side: z.enum(['long', 'short']),
	thesis: z
		.string()
		.trim()
		.min(1)
		.max(4000)
		.optional()
		.describe(
			'Why this position is held. Required when opening a position or flipping its side; ' +
				'omit it to keep the thesis recorded for a position already held on the same side.'
		),
	exit: z
		.string()
		.trim()
		.min(1)
		.max(2000)
		.optional()
		.describe(
			'When or under what conditions to close the position (target, stop, catalyst, date). ' +
				'Required and carried forward like thesis.'
		)
});
