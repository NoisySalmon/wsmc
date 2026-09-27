import { and, eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { AuthError, inviteUser, removeAssignment } from '$lib/server/auth/service';
import { createEmailProvider, resolveAppOrigin } from '$lib/server/auth/email';
import { normalizeEmail } from '$lib/server/auth/crypto';
import { getDb, schema } from '$lib/server/db';
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
	return contest;
}

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const contest = await authorizedContest(locals, db, params.contestId);
	const scorekeepers = await db.select({ userId: schema.scorekeeperAssignments.userId, email: schema.users.email, displayName: schema.users.displayName, status: schema.users.status })
		.from(schema.scorekeeperAssignments).innerJoin(schema.users, eq(schema.users.id, schema.scorekeeperAssignments.userId))
		.where(eq(schema.scorekeeperAssignments.contestId, contest.id));
	return { contest, scorekeepers };
};

export const actions: Actions = {
	invite: async ({ locals, platform, params, request, url }) => {
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		const contest = await authorizedContest(locals, db, params.contestId);
		const data = await request.formData();
		const email = text(data, 'email');
		const displayName = text(data, 'displayName');
		if (!email || !displayName) return fail(400, { error: 'Name and email are required.' });
		try {
			const normalizedEmail = normalizeEmail(email);
			const [existingUser] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, normalizedEmail));
			const result = await inviteUser(db, createEmailProvider(platform.env), {
				email, ...(existingUser ? {} : { displayName }), origin: resolveAppOrigin(platform.env, url.origin),
				assignments: [{ kind: 'scorekeeper', contestId: contest.id }],
			});
			return { success: `Scorekeeper invitation sent to ${result.user.email}.` };
		} catch (cause) {
			return fail(400, { error: cause instanceof AuthError ? cause.message : 'Scorekeeper could not be invited.' });
		}
	},
	remove: async ({ locals, platform, params, request }) => {
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		const contest = await authorizedContest(locals, db, params.contestId);
		const userId = text(await request.formData(), 'userId');
		if (!userId) return fail(400, { error: 'Choose a scorekeeper to remove.' });
		await removeAssignment(db, { kind: 'scorekeeper', userId, contestId: contest.id });
		return { success: 'Scorekeeper assignment removed from this contest.' };
	}
};
