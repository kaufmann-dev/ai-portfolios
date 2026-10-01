import { asc, eq, or, sql } from 'drizzle-orm';
import { slugify } from '#lib/schemas.js';
import { db } from '../db';
import { strategies } from '../db/schema';
import { ServiceError } from './errors';

export type Strategy = typeof strategies.$inferSelect;

export interface StrategyInput {
	name: string;
	slug: string;
	content: string;
}

export function listStrategies(): Promise<Strategy[]> {
	return db.select().from(strategies).orderBy(asc(strategies.name));
}

/** Finds a strategy by slug or, failing that, by exact case-insensitive name. */
export async function findStrategy(ref: string): Promise<Strategy | null> {
	const rows = await db
		.select()
		.from(strategies)
		.where(
			or(
				eq(strategies.slug, ref.trim().toLowerCase()),
				sql`lower(${strategies.name}) = lower(${ref.trim()})`
			)
		);
	return rows.find((s) => s.slug === ref.trim().toLowerCase()) ?? rows[0] ?? null;
}

export async function getStrategy(ref: string): Promise<Strategy> {
	const strategy = await findStrategy(ref);
	if (!strategy) throw new ServiceError(`Strategy "${ref}" does not exist.`, 404);
	return strategy;
}

function resolveSlug(input: StrategyInput): string {
	const slug = input.slug || slugify(input.name);
	if (!slug) throw new ServiceError('Choose a slug with at least one letter or number.');
	return slug;
}

async function assertSlugFree(slug: string, exceptId?: number): Promise<void> {
	const [existing] = await db.select().from(strategies).where(eq(strategies.slug, slug));
	if (existing && existing.id !== exceptId) {
		throw new ServiceError(`A strategy with the slug "${slug}" already exists.`, 409);
	}
}

export async function createStrategy(input: StrategyInput): Promise<Strategy> {
	const slug = resolveSlug(input);
	await assertSlugFree(slug);
	const [created] = await db
		.insert(strategies)
		.values({ name: input.name, slug, content: input.content })
		.returning();
	return created;
}

export async function updateStrategy(id: number, input: StrategyInput): Promise<Strategy> {
	const slug = resolveSlug(input);
	await assertSlugFree(slug, id);
	const [updated] = await db
		.update(strategies)
		.set({ name: input.name, slug, content: input.content })
		.where(eq(strategies.id, id))
		.returning();
	if (!updated) throw new ServiceError('Strategy not found.', 404);
	return updated;
}

export async function deleteStrategy(id: number): Promise<void> {
	await db.delete(strategies).where(eq(strategies.id, id));
}
