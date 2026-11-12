import { and, eq, inArray, ne } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db';
import { canAdministerUsers } from '$lib/server/auth/capabilities';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, platform }) => {
	const principal = locals.principal;
	if (!principal || !platform?.env.DB) return { principal, roleLinks: [], nav: null };

	const db = getDb(platform.env.DB);
	const isAdmin = canAdministerUsers(principal);
	const isRegional = principal.regionalContestIds.length > 0;
	const isCoach = principal.coachAssignments.length > 0;
	const isScorekeeper = principal.scorekeeperContestIds.length > 0;

	const contestIds = [...new Set([...principal.regionalContestIds, ...principal.scorekeeperContestIds])];
	const assignedContests = contestIds.length
		? await db.select({ id: schema.contests.id, name: schema.contests.name, kind: schema.contests.kind, lifecycle: schema.contests.lifecycle, regionNumber: schema.regions.number, regionName: schema.regions.name }).from(schema.contests)
			.innerJoin(schema.regions, eq(schema.regions.id, schema.contests.regionId))
			.innerJoin(schema.seasons, eq(schema.seasons.id, schema.contests.seasonId))
			.where(and(inArray(schema.contests.id, contestIds), ne(schema.seasons.status, 'archived')))
		: [];
	const roleLinks: { href: string; label: string }[] = [];
	// Show assigned contests from the current season; archives remain accessible from Home.
	// Regional coordinators get one short region link to the contest overview.
	// Scorekeepers: just Scoring. No per-school registration spam — coaches use My schools.
	for (const contest of assignedContests.filter((item) => item.kind === 'regional')) {
		const isCoordinator = principal.regionalContestIds.includes(contest.id);
		if (isCoordinator) {
			roleLinks.push({ href: `/contests/${contest.id}`, label: `Region ${contest.regionNumber} — ${contest.regionName}` });
		} else if (['roster_locked', 'scoring', 'finalized'].includes(contest.lifecycle)) roleLinks.push({ href: `/scoring/${contest.id}`, label: `Scoring · ${contest.name}` });
	}

	return {
		principal,
		roleLinks,
		nav: { isAdmin, isRegional, isCoach, isScorekeeper },
	};
};
