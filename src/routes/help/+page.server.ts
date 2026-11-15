import { desc } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.principal?.isAdmin || !platform?.env.DB) return { exportSeasons: [] };
	const seasons = await getDb(platform.env.DB).select({ id: schema.seasons.id, year: schema.seasons.year, status: schema.seasons.status })
		.from(schema.seasons).orderBy(desc(schema.seasons.year));
	return { exportSeasons: seasons };
};
