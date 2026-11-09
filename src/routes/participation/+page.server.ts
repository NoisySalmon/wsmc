import { and, eq, inArray } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { canAdministerUsers, canCoordinateRegion, canCoordinateState } from '$lib/server/auth/capabilities';
import { inviteSchool, ParticipationError, setParticipationStatus, withdrawSchool, type InvitationStatus } from '$lib/server/program/participation';
import { canManageParticipationResponse } from '$lib/server/program/participation-access';
import { getDb, schema } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

function requireCoordinator(locals: App.Locals): void {
	if (!locals.principal || (locals.principal.statewideSeasonIds.length === 0 && locals.principal.regionalContestIds.length === 0)) throw error(403, 'Coordinator access required.');
}

function text(data: FormData, name: string): string {
	const value = data.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function canManageContest(locals: App.Locals, contest: { id: string; seasonId: string }): boolean {
	return Boolean(locals.principal && (canAdministerUsers(locals.principal) || canCoordinateState(locals.principal, contest.seasonId) || canCoordinateRegion(locals.principal, contest.id)));
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireCoordinator(locals);
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [allContests, schools] = await Promise.all([
		db.select().from(schema.contests),
		db.select().from(schema.schools).where(eq(schema.schools.active, true)),
	]);
	const contests = allContests.filter((contest) => canManageContest(locals, contest));
	const contestIds = contests.map((contest) => contest.id);
	const participations = contestIds.length ? await db.select().from(schema.schoolParticipations).where(inArray(schema.schoolParticipations.contestId, contestIds)) : [];
	const coachRows = contestIds.length ? await db.select({ userId: schema.coachAssignments.userId, schoolId: schema.coachAssignments.schoolId, seasonId: schema.coachAssignments.seasonId, displayName: schema.users.displayName, email: schema.users.email })
		.from(schema.coachAssignments)
		.innerJoin(schema.users, eq(schema.users.id, schema.coachAssignments.userId))
		.innerJoin(schema.schoolParticipations, eq(schema.schoolParticipations.schoolId, schema.coachAssignments.schoolId))
		.innerJoin(schema.contests, and(eq(schema.contests.id, schema.schoolParticipations.contestId), eq(schema.contests.seasonId, schema.coachAssignments.seasonId)))
		.where(inArray(schema.contests.id, contestIds)) : [];
	const coachAssignments = [...new Map(coachRows.map((row) => [`${row.userId}/${row.schoolId}/${row.seasonId}`, row])).values()];
	return { contests, schools, coachAssignments, participations, canAddSchools: canAdministerUsers(locals.principal!) };
};

export const actions: Actions = {
	invite: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const db = getDb(platform.env.DB);
		const contestId = text(data, 'contestId');
		const [contest] = await db.select({ id: schema.contests.id, seasonId: schema.contests.seasonId }).from(schema.contests).where(eq(schema.contests.id, contestId));
		if (!contest || !canManageContest(locals, contest)) throw error(403, 'You cannot manage this contest.');
		try {
			const divisionRaw = text(data, 'division');
			await inviteSchool(db, { contestId, schoolId: text(data, 'schoolId'), division: divisionRaw ? Number(divisionRaw) : null });
			return { success: 'School invited with its school-record division.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ParticipationError ? cause.message : 'School could not be invited.' });
		}
	},
	withdraw: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const db = getDb(platform.env.DB);
		const contestId = text(data, 'contestId');
		const participationId = text(data, 'participationId');
		const [contest] = await db.select({ id: schema.contests.id, seasonId: schema.contests.seasonId }).from(schema.contests).where(eq(schema.contests.id, contestId));
		if (!contest || !canManageContest(locals, contest)) throw error(403, 'You cannot manage this contest.');
		try {
			await withdrawSchool(db, { participationId, contestId });
			return { success: 'School removed from this contest. Re-add it to the correct region to move it.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ParticipationError ? cause.message : 'School could not be removed.' });
		}
	},
	respond: async ({ locals, platform, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const db = getDb(platform.env.DB);
		const contestId = text(data, 'contestId');
		const participationId = text(data, 'participationId');
		const [row] = await db.select({ schoolId: schema.schoolParticipations.schoolId, seasonId: schema.contests.seasonId }).from(schema.schoolParticipations).innerJoin(schema.contests, eq(schema.contests.id, schema.schoolParticipations.contestId)).where(and(eq(schema.schoolParticipations.id, participationId), eq(schema.schoolParticipations.contestId, contestId)));
		if (!row || !canManageParticipationResponse(locals.principal, { contestId, schoolId: row.schoolId, seasonId: row.seasonId })) throw error(403, 'You cannot respond for this school.');
		const status = text(data, 'status') as InvitationStatus;
		if (!['accepted', 'declined'].includes(status)) return fail(400, { error: 'Choose accept or decline.' });
		try {
			await setParticipationStatus(db, { participationId, contestId, status });
			return { success: `Participation ${status}.` };
		} catch (cause) {
			return fail(400, { error: cause instanceof ParticipationError ? cause.message : 'Participation response could not be saved.' });
		}
	},
};
