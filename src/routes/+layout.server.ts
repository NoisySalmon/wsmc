import { inArray } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db';
import { canAdministerUsers } from '$lib/server/auth/capabilities';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, platform }) => {
	const principal = locals.principal;
	if (!principal || !platform?.env.DB) return { principal, roleLinks: [], nav: null };

	const db = getDb(platform.env.DB);
	const isSystem = canAdministerUsers(principal);
	const isSeasonCoordinator = principal.statewideSeasonIds.length > 0;
	const isRegional = principal.regionalContestIds.length > 0;
	const isCoach = principal.coachAssignments.length > 0;
	const isScorekeeper = principal.scorekeeperContestIds.length > 0;

	const contestIds = [...new Set([...principal.regionalContestIds, ...principal.scorekeeperContestIds])];
	const assignedContests = contestIds.length
		? await db.select({ id: schema.contests.id, name: schema.contests.name, kind: schema.contests.kind, lifecycle: schema.contests.lifecycle, seasonId: schema.contests.seasonId }).from(schema.contests).where(inArray(schema.contests.id, contestIds))
		: [];
	const roleLinks: { href: string; label: string }[] = [];
	// Regional coordinators: one Overview link per assigned regional contest, plus Scoring when relevant.
	// Scorekeepers: just Scoring. No per-school registration spam — coaches use My schools.
	for (const contest of assignedContests.filter((item) => item.kind === 'regional')) {
		const isCoordinator = principal.regionalContestIds.includes(contest.id);
		if (isCoordinator) roleLinks.push({ href: `/contests/${contest.id}`, label: `Overview · ${contest.name}` });
		if (['roster_locked', 'scoring', 'finalized'].includes(contest.lifecycle)) roleLinks.push({ href: `/scoring/${contest.id}`, label: `Scoring · ${contest.name}` });
	}

	return {
		principal,
		roleLinks,
		nav: { isSystem, isSeasonCoordinator, isRegional, isCoach, isScorekeeper },
	};
};
