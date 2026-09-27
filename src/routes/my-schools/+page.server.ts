import { and, eq, inArray } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { getDb, schema } from '$lib/server/db';
import { ParticipationError, setParticipationStatus, type InvitationStatus } from '$lib/server/program/participation';
import { canCoachRespondForSchool } from '$lib/server/program/participation-access';
import type { Actions, PageServerLoad } from './$types';

function text(data: FormData, name: string): string {
	const value = data.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

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
	const participations = rows.filter((row) => canCoachRespondForSchool(locals.principal!, row.participation.schoolId, row.seasonId))
		.map((row) => ({ ...row.participation, contestName: row.contestName, contestKind: row.contestKind, contestLifecycle: row.contestLifecycle, seasonId: row.seasonId, seasonName: row.seasonName, seasonYear: row.seasonYear, schoolName: row.schoolName,
			canRespond: row.contestKind === 'regional' && ['setup', 'registration_open'].includes(row.contestLifecycle),
		})).sort((a, b) => b.seasonYear - a.seasonYear || a.contestName.localeCompare(b.contestName) || a.schoolName.localeCompare(b.schoolName));
	return { participations };
};

export const actions: Actions = {
	respond: async ({ locals, platform, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const participationId = text(data, 'participationId');
		const contestId = text(data, 'contestId');
		const status = text(data, 'status') as InvitationStatus;
		if (!['accepted', 'declined'].includes(status)) return fail(400, { error: 'Choose accept or decline.' });
		const db = getDb(platform.env.DB);
		const [row] = await db.select({ schoolId: schema.schoolParticipations.schoolId, seasonId: schema.contests.seasonId, contestKind: schema.contests.kind })
			.from(schema.schoolParticipations).innerJoin(schema.contests, eq(schema.contests.id, schema.schoolParticipations.contestId))
			.where(and(eq(schema.schoolParticipations.id, participationId), eq(schema.schoolParticipations.contestId, contestId)));
		if (!row || !canCoachRespondForSchool(locals.principal, row.schoolId, row.seasonId)) throw error(403, 'You cannot respond for this school.');
		if (row.contestKind !== 'regional') throw error(400, 'State attendance is managed separately.');
		try {
			await setParticipationStatus(db, { participationId, contestId, status });
			return { success: `Participation ${status}.` };
		} catch (cause) {
			return fail(400, { error: cause instanceof ParticipationError ? cause.message : 'Participation response could not be saved.' });
		}
	}
};
