import { and, eq, inArray } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { canAdministerUsers, canCoachSchool, canCoordinateRegion, canCoordinateState } from '$lib/server/auth/capabilities';
import { createEmailProvider } from '$lib/server/auth/email';
import { AuthError, inviteUser } from '$lib/server/auth/service';
import { assignCoach, inviteSchool, ParticipationError, removeCoach, setParticipationStatus, type InvitationStatus } from '$lib/server/program/participation';
import { canManageSeasonAssignments } from '$lib/server/program/access';
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
	const [allContests, schools, users, assignments, seasons] = await Promise.all([
		db.select().from(schema.contests),
		db.select().from(schema.schools).where(eq(schema.schools.active, true)),
		db.select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName, status: schema.users.status }).from(schema.users).where(eq(schema.users.status, 'active')),
		db.select().from(schema.coachAssignments),
		db.select({ id: schema.seasons.id, name: schema.seasons.name, year: schema.seasons.year, status: schema.seasons.status }).from(schema.seasons),
	]);
	const contests = allContests.filter((contest) => canManageContest(locals, contest));
	const contestIds = contests.map((contest) => contest.id);
	const participations = contestIds.length ? await db.select().from(schema.schoolParticipations).where(inArray(schema.schoolParticipations.contestId, contestIds)) : [];
	const schoolIds = new Set(schools.map((school) => school.id));
	const coachAssignments = assignments.filter((assignment) => schoolIds.has(assignment.schoolId));
	return { contests, schools, users, seasons, participations, coachAssignments };
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
			await inviteSchool(db, { contestId, schoolId: text(data, 'schoolId'), division: Number(text(data, 'division')) });
			return { success: 'School invited.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ParticipationError ? cause.message : 'School could not be invited.' });
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
		if (!row || !canCoordinateState(locals.principal, row.seasonId) && !canCoachSchool(locals.principal, row.schoolId, row.seasonId)) throw error(403, 'You cannot respond for this school.');
		const status = text(data, 'status') as InvitationStatus;
		if (!['accepted', 'declined'].includes(status)) return fail(400, { error: 'Choose accept or decline.' });
		try {
			await setParticipationStatus(db, { participationId, contestId, status });
			return { success: `Participation ${status}.` };
		} catch (cause) {
			return fail(400, { error: cause instanceof ParticipationError ? cause.message : 'Participation response could not be saved.' });
		}
	},
	assignCoach: async ({ locals, platform, request }) => {
		if (!locals.principal) throw error(403, 'Coordinator access required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const db = getDb(platform.env.DB);
		if (!await canManageSeasonAssignments(db, locals.principal, text(data, 'seasonId'), text(data, 'schoolId'))) throw error(403, 'You cannot manage coach assignments for this school.');
		try {
			await assignCoach(db, { userId: text(data, 'userId'), seasonId: text(data, 'seasonId'), schoolId: text(data, 'schoolId') });
			return { success: 'Coach assignment saved.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ParticipationError ? cause.message : 'Coach assignment could not be saved.' });
		}
	},
	inviteCoach: async ({ locals, platform, request, url }) => {
		if (!locals.principal) throw error(403, 'Coordinator access required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const db = getDb(platform.env.DB);
		const seasonId = text(data, 'seasonId');
		if (!await canManageSeasonAssignments(db, locals.principal, seasonId, text(data, 'schoolId'))) throw error(403, 'You cannot manage coach assignments for this school.');
		const email = text(data, 'email');
		const displayName = text(data, 'displayName');
		if (!email || !displayName || !text(data, 'schoolId')) return fail(400, { error: 'Coach name, email, school, and season are required.' });
		try {
			const result = await inviteUser(db, createEmailProvider(platform.env), { email, displayName, origin: platform.env.APP_ORIGIN ?? url.origin, assignments: [{ kind: 'coach', seasonId, schoolId: text(data, 'schoolId') }] });
			return { success: `Coach invitation sent to ${result.user.email}.` };
		} catch (cause) {
			return fail(400, { error: cause instanceof AuthError ? cause.message : 'Coach invitation could not be sent.' });
		}
	},
	removeCoach: async ({ locals, platform, request }) => {
		if (!locals.principal) throw error(403, 'Coordinator access required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const db = getDb(platform.env.DB);
		if (!await canManageSeasonAssignments(db, locals.principal, text(data, 'seasonId'), text(data, 'schoolId'))) throw error(403, 'You cannot manage coach assignments for this school.');
		await removeCoach(db, { userId: text(data, 'userId'), seasonId: text(data, 'seasonId'), schoolId: text(data, 'schoolId') });
		return { success: 'Coach assignment removed.' };
	},
};
