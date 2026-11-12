import { qrActions } from '$lib/server/auth/qr';
import { and, eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { addPerson, AuthError, removeAssignment, sendSignInLink, type InviteAssignment } from '$lib/server/auth/service';
import { createEmailProvider, resolveAppOrigin } from '$lib/server/auth/email';
import { getDb, schema } from '$lib/server/db';
import { canAdministerUsers } from '$lib/server/auth/capabilities';
import { canManageRegionalContestStaff } from '../../contest-staff-access';
import type { Actions, PageServerLoad } from './$types';

function text(data: FormData, name: string): string {
	const value = data.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

async function authorizedContest(locals: App.Locals, db: ReturnType<typeof getDb>, contestId: string) {
	if (!locals.principal) throw error(401, 'Sign in required.');
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	if (!contest) throw error(404, 'Contest not found.');
	if (!canManageRegionalContestStaff(locals.principal, contest)) throw error(403, 'Regional coordinator access required.');
	const [region] = await db.select().from(schema.regions).where(eq(schema.regions.id, contest.regionId!));
	if (!region) throw error(404, 'Region not found.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	return { ...contest, regionNumber: region.number, archived: season?.status === 'archived' };
}

async function readAssignment(db: ReturnType<typeof getDb>, locals: App.Locals, contest: { id: string; seasonId: string; regionNumber: number; archived: boolean }, data: FormData): Promise<InviteAssignment> {
	if (contest.archived) throw error(403, 'Archived seasons are read-only. Manage current access from the current season or Users & access.');
	switch (text(data, 'role')) {
		case 'regional':
			if (!canAdministerUsers(locals.principal!)) throw error(403, 'Administrator access required.');
			return { kind: 'regional', regionNumber: contest.regionNumber };
		case 'scorekeeper': return { kind: 'scorekeeper', contestId: contest.id };
		case 'coach': {
			const schoolId = text(data, 'schoolId');
			const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.contestId, contest.id), eq(schema.schoolParticipations.schoolId, schoolId)));
			if (!participation) throw error(403, 'School does not participate in this contest.');
			return { kind: 'coach', schoolId };
		}
		default: throw error(400, 'Choose a valid assignment.');
	}
}

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const contest = await authorizedContest(locals, db, params.contestId);
	const userFields = { userId: schema.users.id, email: schema.users.email, displayName: schema.users.displayName, status: schema.users.status };
	const [scorekeepers, coordinators, schools, coaches, admins, regionalUsers] = await Promise.all([
		db.select(userFields).from(schema.scorekeeperAssignments).innerJoin(schema.users, eq(schema.users.id, schema.scorekeeperAssignments.userId)).where(eq(schema.scorekeeperAssignments.contestId, contest.id)),
		db.select(userFields).from(schema.regionalCoordinatorAssignments).innerJoin(schema.users, eq(schema.users.id, schema.regionalCoordinatorAssignments.userId)).where(eq(schema.regionalCoordinatorAssignments.regionNumber, contest.regionNumber)),
		db.select({ id: schema.schools.id, name: schema.schools.name }).from(schema.schoolParticipations).innerJoin(schema.schools, eq(schema.schools.id, schema.schoolParticipations.schoolId)).where(eq(schema.schoolParticipations.contestId, contest.id)),
		db.select({ ...userFields, schoolId: schema.coachAssignments.schoolId }).from(schema.coachAssignments)
			.innerJoin(schema.users, eq(schema.users.id, schema.coachAssignments.userId))
			.innerJoin(schema.schoolParticipations, eq(schema.schoolParticipations.schoolId, schema.coachAssignments.schoolId))
			.where(eq(schema.schoolParticipations.contestId, contest.id)),
		db.select({ userId: schema.statewideAssignments.userId }).from(schema.statewideAssignments),
		db.select({ userId: schema.regionalCoordinatorAssignments.userId }).from(schema.regionalCoordinatorAssignments),
	]);
	const protectedIds = new Set([...admins, ...regionalUsers].map((row) => row.userId));
	const withQr = <T extends { userId: string; status: string }>(person: T) => ({ ...person, canGenerateQr: person.status !== 'disabled' && (canAdministerUsers(locals.principal!) || !protectedIds.has(person.userId)) });
	return { contest, scorekeepers: scorekeepers.map(withQr), coordinators: coordinators.map(withQr), schools, coaches: coaches.map(withQr), canManageCoordinators: canAdministerUsers(locals.principal!), canRemovePersistentAccess: canAdministerUsers(locals.principal!) };
};

export const actions: Actions = {
	...qrActions('contest'),
	add: async ({ locals, platform, params, request, url }) => {
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		const contest = await authorizedContest(locals, db, params.contestId);
		const data = await request.formData();
		const assignment = await readAssignment(db, locals, contest, data);
		try {
			const result = await addPerson(db, createEmailProvider(platform.env), { actorUserId: locals.principal!.id, email: text(data, 'email'), displayName: text(data, 'displayName'), origin: resolveAppOrigin(platform.env, url.origin), assignments: [assignment] });
			return { success: result.invited ? `Invitation sent to ${result.user.email}.` : `Access added for ${result.user.email}. No email was sent.` };
		} catch (cause) {
			return fail(400, { error: cause instanceof AuthError ? cause.message : 'Person could not be added.' });
		}
	},
	remove: async ({ locals, platform, params, request }) => {
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		const contest = await authorizedContest(locals, db, params.contestId);
		const data = await request.formData();
		const assignment = await readAssignment(db, locals, contest, data);
		if (assignment.kind !== 'scorekeeper' && !canAdministerUsers(locals.principal!)) throw error(403, 'Administrator access required to remove coach or coordinator access.');
		const userId = text(data, 'userId');
		if (!userId) return fail(400, { error: 'Choose a person to remove.' });
		await removeAssignment(db, { ...assignment, userId }, locals.principal!.id);
		return { success: assignment.kind === 'scorekeeper' ? 'Assignment removed from this contest.' : 'Access removed across seasons.' };
	},
	resend: async ({ locals, platform, params, request, url }) => {
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		const contest = await authorizedContest(locals, db, params.contestId);
		const data = await request.formData();
		const assignment = await readAssignment(db, locals, contest, data);
		const userId = text(data, 'userId');
		const [membership] = assignment.kind === 'coach'
			? await db.select().from(schema.coachAssignments).where(and(eq(schema.coachAssignments.userId, userId), eq(schema.coachAssignments.schoolId, assignment.schoolId)))
			: assignment.kind === 'regional'
				? await db.select().from(schema.regionalCoordinatorAssignments).where(and(eq(schema.regionalCoordinatorAssignments.userId, userId), eq(schema.regionalCoordinatorAssignments.regionNumber, contest.regionNumber)))
				: await db.select().from(schema.scorekeeperAssignments).where(and(eq(schema.scorekeeperAssignments.userId, userId), eq(schema.scorekeeperAssignments.contestId, contest.id)));
		if (!membership) throw error(403, 'Person is not assigned here.');
		const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
		if (!user || user.status !== 'pending') return fail(400, { error: 'Choose a pending account.' });
		await sendSignInLink(db, createEmailProvider(platform.env), { userId, email: user.email, origin: resolveAppOrigin(platform.env, url.origin), purpose: 'invite' });
		return { success: `Invitation resent to ${user.email}. Earlier outstanding links have been replaced.` };
	},
};
