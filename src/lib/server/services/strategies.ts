import { and, asc, desc, eq, max, or, sql } from 'drizzle-orm';
import { slugify } from '#lib/schemas.js';
import { db } from '../db';
import { strategies, strategyVersions } from '../db/schema';
import { ServiceError } from './errors';

/**
 * A strategy with the text of one version, the latest unless asked otherwise. Versions are shown in
 * the web UI only; MCP tools must not expose them.
 */
export type Strategy = typeof strategies.$inferSelect & {
	/** Id of the strategy_versions row. */
	versionId: number;
	version: number;
	latestVersion: number;
	content: string;
	versionCreatedAt: Date;
};

export interface StrategyInput {
	name: string;
	slug: string;
	content: string;
}

export interface StrategyVersionSummary {
	version: number;
	createdAt: Date;
	length: number;
}

const latestVersions = db
	.select({
		strategyId: strategyVersions.strategyId,
		latest: max(strategyVersions.version).as('latest')
	})
	.from(strategyVersions)
	.groupBy(strategyVersions.strategyId)
	.as('latest_versions');

/** Strategies joined to one of their versions: the latest, or `version` when given. */
function selectWithVersion(version?: number) {
	return db
		.select({
			strategy: strategies,
			versionId: strategyVersions.id,
			version: strategyVersions.version,
			latestVersion: latestVersions.latest,
			content: strategyVersions.content,
			versionCreatedAt: strategyVersions.createdAt
		})
		.from(strategies)
		.innerJoin(latestVersions, eq(latestVersions.strategyId, strategies.id))
		.innerJoin(
			strategyVersions,
			and(
				eq(strategyVersions.strategyId, strategies.id),
				version === undefined
					? eq(strategyVersions.version, latestVersions.latest)
					: eq(strategyVersions.version, version)
			)
		);
}

type Row = Awaited<ReturnType<ReturnType<typeof selectWithVersion>['execute']>>[number];

function toStrategy(row: Row): Strategy {
	return {
		...row.strategy,
		versionId: row.versionId,
		version: row.version,
		latestVersion: Number(row.latestVersion),
		content: row.content,
		versionCreatedAt: row.versionCreatedAt
	};
}

export async function listStrategies(): Promise<Strategy[]> {
	return (await selectWithVersion().orderBy(asc(strategies.name))).map(toStrategy);
}

/** Finds a strategy by slug or, failing that, by exact case-insensitive name. */
export async function findStrategy(ref: string, version?: number): Promise<Strategy | null> {
	const slug = ref.trim().toLowerCase();
	const rows = await selectWithVersion(version).where(
		or(eq(strategies.slug, slug), sql`lower(${strategies.name}) = lower(${ref.trim()})`)
	);
	const row = rows.find((r) => r.strategy.slug === slug) ?? rows[0];
	return row ? toStrategy(row) : null;
}

export async function getStrategy(ref: string, version?: number): Promise<Strategy> {
	const strategy = await findStrategy(ref, version);
	if (strategy) return strategy;
	if (version !== undefined && (await findStrategy(ref))) {
		throw new ServiceError(`Strategy "${ref}" has no version ${version}.`, 404);
	}
	throw new ServiceError(`Strategy "${ref}" does not exist.`, 404);
}

/** Every version of a strategy, newest first. */
export async function listVersions(strategyId: number): Promise<StrategyVersionSummary[]> {
	return db
		.select({
			version: strategyVersions.version,
			createdAt: strategyVersions.createdAt,
			length: sql<number>`length(${strategyVersions.content})::int`
		})
		.from(strategyVersions)
		.where(eq(strategyVersions.strategyId, strategyId))
		.orderBy(desc(strategyVersions.version));
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
	await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(strategies)
			.values({ name: input.name, slug })
			.returning({ id: strategies.id });
		await tx
			.insert(strategyVersions)
			.values({ strategyId: created.id, version: 1, content: input.content });
	});
	return getStrategy(slug);
}

/** Renames a strategy and, when its text changed, saves the text as the next version. */
export async function updateStrategy(id: number, input: StrategyInput): Promise<Strategy> {
	const slug = resolveSlug(input);
	await assertSlugFree(slug, id);
	await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(2, ${id})`);
		const [updated] = await tx
			.update(strategies)
			.set({ name: input.name, slug })
			.where(eq(strategies.id, id))
			.returning({ id: strategies.id });
		if (!updated) throw new ServiceError('Strategy not found.', 404);
		const [latest] = await tx
			.select()
			.from(strategyVersions)
			.where(eq(strategyVersions.strategyId, id))
			.orderBy(desc(strategyVersions.version))
			.limit(1);
		if (latest?.content !== input.content) {
			await tx.insert(strategyVersions).values({
				strategyId: id,
				version: (latest?.version ?? 0) + 1,
				content: input.content
			});
		}
	});
	return getStrategy(slug);
}

export async function deleteStrategy(id: number): Promise<void> {
	await db.delete(strategies).where(eq(strategies.id, id));
}
