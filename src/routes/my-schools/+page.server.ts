import { eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { getDb, schema } from '$lib/server/db';
import { canCoachSchool } from '$lib/server/auth/capabilities';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const assignments = locals.principal.coachAssignments;
	const schoolIds = [...new Set(assignments.map((assignment) => assignment.schoolId))];
	if (!schoolIds.length) throw error(403, 'Coach assignment required.');
	const db = getDb(platform.env.DB);
	const rows = await db.select({
		participation: schema.schoolParticipations,
		contestName: schema.contests.name,
		contestKind: schema.contests.kind,
		contestLifecycle: schema.contests.lifecycle,
		seasonId: schema.contests.seasonId,
		seasonName: schema.seasons.name,
		seasonYear: schema.seasons.year,
		schoolName: schema.schools.name,
	}).from(schema.schoolParticipations)
		.innerJoin(schema.contests, eq(schema.contests.id, schema.schoolParticipations.contestId))
		.innerJoin(schema.seasons, eq(schema.seasons.id, schema.contests.seasonId))
		.innerJoin(schema.schools, eq(schema.schools.id, schema.schoolParticipations.schoolId))
		.where(inArray(schema.schoolParticipations.schoolId, schoolIds));
	const participations = rows.filter((row) => canCoachSchool(locals.principal!, row.participation.schoolId, row.seasonId))
		.map((row) => ({ ...row.participation, contestName: row.contestName, contestKind: row.contestKind, contestLifecycle: row.contestLifecycle, seasonId: row.seasonId, seasonName: row.seasonName, seasonYear: row.seasonYear, schoolName: row.schoolName,
		})).sort((a, b) => b.seasonYear - a.seasonYear || a.contestName.localeCompare(b.contestName) || a.schoolName.localeCompare(b.schoolName));
	return { participations };
};
