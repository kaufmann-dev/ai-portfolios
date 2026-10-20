import { db } from '../db';
import { appSettings } from '../db/schema';

export type MassivePlan = (typeof appSettings.$inferSelect)['massivePlan'];

let plan: MassivePlan | null = null;

/** The Massive plan of `MASSIVE_API_KEY`, as chosen in Settings. Defaults to the free Basic plan. */
export async function getMassivePlan(): Promise<MassivePlan> {
	if (!plan) {
		const [row] = await db.select({ massivePlan: appSettings.massivePlan }).from(appSettings);
		plan = row?.massivePlan ?? 'basic';
	}
	return plan;
}

export async function setMassivePlan(next: MassivePlan): Promise<void> {
	await db
		.insert(appSettings)
		.values({ id: 1, massivePlan: next })
		.onConflictDoUpdate({ target: appSettings.id, set: { massivePlan: next } });
	plan = next;
}
