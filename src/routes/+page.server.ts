import { inArray } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const principal = locals.principal;
	if (!principal || !platform?.env.DB) return { principal, seasons: [], contests: [], regions: [] };
	const db = getDb(platform.env.DB);
	// Season coordinators (incl. system) see all seasons; others see seasons tied to their assignments.
	const isCoordinator = principal.statewideSeasonIds.length > 0;
	const seasonIds = new Set<string>();
	for (const id of principal.statewideSeasonIds) if (id) seasonIds.add(id);
	for (const assignment of principal.coachAssignments) seasonIds.add(assignment.seasonId);
	let seasons = await db.select({ id: schema.seasons.id, year: schema.seasons.year, name: schema.seasons.name, status: schema.seasons.status }).from(schema.seasons);
	if (!isCoordinator && seasonIds.size > 0) seasons = seasons.filter((season) => seasonIds.has(season.id));
	seasons = [...seasons].sort((a, b) => {
		const order = (s: string) => (s === 'active' ? 0 : s === 'setup' ? 1 : 2);
		return order(a.status) - order(b.status) || b.year - a.year;
	});
	const visibleSeasonIds = seasons.map((season) => season.id);
	if (visibleSeasonIds.length === 0) return { principal, seasons, contests: [], regions: [] };
	const [contests, regions] = await Promise.all([
		db.select({ id: schema.contests.id, seasonId: schema.contests.seasonId, regionId: schema.contests.regionId, name: schema.contests.name, kind: schema.contests.kind, lifecycle: schema.contests.lifecycle }).from(schema.contests).where(inArray(schema.contests.seasonId, visibleSeasonIds)),
		db.select({ id: schema.regions.id, seasonId: schema.regions.seasonId, number: schema.regions.number, name: schema.regions.name }).from(schema.regions).where(inArray(schema.regions.seasonId, visibleSeasonIds)),
	]);
	return { principal, seasons, contests, regions };
};
