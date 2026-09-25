import { listStrategies } from '$lib/server/services/strategies';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ strategies: await listStrategies() });
