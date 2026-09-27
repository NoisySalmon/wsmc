import { inArray } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, platform }) => {
	const principal = locals.principal;
	if (!principal || !platform?.env.DB) return { principal, roleLinks: [] };

	const db = getDb(platform.env.DB);
	const contestIds = [...new Set([...principal.regionalContestIds, ...principal.scorekeeperContestIds])];
	const assignedContests = contestIds.length
		? await db.select({ id: schema.contests.id, name: schema.contests.name, kind: schema.contests.kind, lifecycle: schema.contests.lifecycle }).from(schema.contests).where(inArray(schema.contests.id, contestIds))
		: [];
	const roleLinks: { href: string; label: string }[] = [];
	for (const contest of assignedContests.filter((item) => item.kind === 'regional')) {
		roleLinks.push({ href: `/contests/${contest.id}`, label: `Overview · ${contest.name}` });
		if (['roster_locked', 'scoring', 'finalized'].includes(contest.lifecycle)) roleLinks.push({ href: `/scoring/${contest.id}`, label: `Scoring · ${contest.name}` });
	}

	const coachAssignments = principal.coachAssignments;
	const seasonIds = [...new Set(coachAssignments.map((assignment) => assignment.seasonId))];
	if (seasonIds.length) {
		const [contests, schools] = await Promise.all([
				db.select({ id: schema.contests.id, seasonId: schema.contests.seasonId, name: schema.contests.name, kind: schema.contests.kind, lifecycle: schema.contests.lifecycle, resultsPublishedAt: schema.contests.resultsPublishedAt })
				.from(schema.contests)
				.where(inArray(schema.contests.seasonId, seasonIds)),
			db.select({ id: schema.schools.id, name: schema.schools.name })
				.from(schema.schools)
				.where(inArray(schema.schools.id, [...new Set(coachAssignments.map((assignment) => assignment.schoolId))])),
		]);
		const regionalContests = contests.filter((contest) => contest.kind === 'regional');
		for (const contest of regionalContests.filter((item) => item.lifecycle === 'finalized' && item.resultsPublishedAt !== null)) {
			roleLinks.push({ href: `/results/${contest.id}`, label: `Results · ${contest.name}` });
		}
		const regionalIds = regionalContests.map((contest) => contest.id);
		const participationRows = regionalIds.length
			? await db.select({ contestId: schema.schoolParticipations.contestId, schoolId: schema.schoolParticipations.schoolId })
				.from(schema.schoolParticipations)
				.where(inArray(schema.schoolParticipations.contestId, regionalIds))
			: [];
		const participationKeys = new Set(participationRows.map((row) => `${row.contestId}:${row.schoolId}`));
		for (const assignment of coachAssignments) {
			const school = schools.find((candidate) => candidate.id === assignment.schoolId);
			for (const contest of regionalContests.filter((candidate) => candidate.seasonId === assignment.seasonId)) {
				if (participationKeys.has(`${contest.id}:${assignment.schoolId}`)) {
					roleLinks.push({ href: `/registration/${contest.id}/${assignment.schoolId}`, label: `Registration · ${school?.name ?? 'School'} · ${contest.name}` });
				}
			}
		}
	}

	return { principal, roleLinks };
};
