import { and, eq, inArray } from 'drizzle-orm';
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
		seasonYear: schema.seasons.year,
		schoolName: schema.schools.name,
	}).from(schema.schoolParticipations)
		.innerJoin(schema.contests, eq(schema.contests.id, schema.schoolParticipations.contestId))
		.innerJoin(schema.seasons, eq(schema.seasons.id, schema.contests.seasonId))
		.innerJoin(schema.schools, eq(schema.schools.id, schema.schoolParticipations.schoolId))
		.where(inArray(schema.schoolParticipations.schoolId, schoolIds));
	const participations = rows.filter((row) => row.contestKind === 'regional' && canCoachSchool(locals.principal!, row.participation.schoolId, row.seasonId))
		.map((row) => ({ ...row.participation, contestName: row.contestName, contestKind: row.contestKind, contestLifecycle: row.contestLifecycle, seasonId: row.seasonId, seasonYear: row.seasonYear, schoolName: row.schoolName,
		})).sort((a, b) => b.seasonYear - a.seasonYear || a.contestName.localeCompare(b.contestName) || a.schoolName.localeCompare(b.schoolName));
	const qualified = await db.select({ contestId: schema.contests.id, contestName: schema.contests.name, contestLifecycle: schema.contests.lifecycle, schoolId: schema.schools.id, schoolName: schema.schools.name, division: schema.schools.division, seasonYear: schema.seasons.year })
		.from(schema.qualifications)
		.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
		.innerJoin(schema.entries, eq(schema.entries.id, schema.qualifications.entryId))
		.innerJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId))
		.innerJoin(schema.seasons, eq(schema.seasons.id, schema.qualificationRounds.seasonId))
		.innerJoin(schema.contests, and(eq(schema.contests.seasonId, schema.seasons.id), eq(schema.contests.kind, 'state')))
		.where(and(inArray(schema.schools.id, schoolIds), eq(schema.qualificationRounds.status, 'published'), eq(schema.qualifications.active, true)));
	const stateRegistrations = [...new Map(qualified.map(row => [`${row.contestId}:${row.schoolId}`, row])).values()].sort((a, b) => b.seasonYear - a.seasonYear || a.schoolName.localeCompare(b.schoolName));
	return { participations, stateRegistrations };
};
