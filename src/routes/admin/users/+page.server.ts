import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { canAdministerUsers } from '$lib/server/auth/capabilities';
import { createEmailProvider } from '$lib/server/auth/email';
import {
	AuthError,
	inviteUser,
	revokeUserSessions,
	revokeUserTokens,
	setUserStatus,
} from '$lib/server/auth/service';
import { getDb, schema } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

function requireUserAdmin(locals: App.Locals): void {
	if (!locals.principal || !canAdministerUsers(locals.principal)) throw error(403, 'System coordinator access required.');
}

function requiredText(value: FormDataEntryValue | null, label: string): string {
	const result = typeof value === 'string' ? value.trim() : '';
	if (!result) throw new AuthError('invalid_request', `${label} is required.`);
	return result;
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireUserAdmin(locals);
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [users, seasons, contests, schools] = await Promise.all([
		db.select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName, status: schema.users.status, createdAt: schema.users.createdAt }).from(schema.users),
		db.select({ id: schema.seasons.id, name: schema.seasons.name, year: schema.seasons.year }).from(schema.seasons),
		db.select({ id: schema.contests.id, name: schema.contests.name, kind: schema.contests.kind }).from(schema.contests),
		db.select({ id: schema.schools.id, name: schema.schools.name }).from(schema.schools).where(eq(schema.schools.active, true)),
	]);
	return { users, seasons, contests, schools };
};

export const actions: Actions = {
	invite: async ({ locals, platform, request, url }) => {
		requireUserAdmin(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		try {
			const role = requiredText(data.get('role'), 'Assignment');
			let assignment;
			switch (role) {
				case 'statewide':
					assignment = { kind: 'statewide' as const, seasonId: null };
					break;
				case 'season':
					assignment = { kind: 'statewide' as const, seasonId: requiredText(data.get('seasonId'), 'Season') };
					break;
				case 'regional':
					assignment = { kind: 'regional' as const, contestId: requiredText(data.get('contestId'), 'Contest') };
					break;
				case 'coach':
					assignment = { kind: 'coach' as const, seasonId: requiredText(data.get('seasonId'), 'Season'), schoolId: requiredText(data.get('schoolId'), 'School') };
					break;
				case 'scorekeeper':
					assignment = { kind: 'scorekeeper' as const, contestId: requiredText(data.get('contestId'), 'Contest') };
					break;
				default:
					throw new AuthError('invalid_request', 'Choose a valid assignment.');
			}
			const result = await inviteUser(getDb(platform.env.DB), createEmailProvider(platform.env), {
				email: requiredText(data.get('email'), 'Email'),
				displayName: requiredText(data.get('displayName'), 'Name'),
				assignments: [assignment],
				origin: platform.env.APP_ORIGIN ?? url.origin,
			});
			return { success: `Invitation sent to ${result.user.email}.` };
		} catch (cause) {
			if (cause instanceof AuthError) return fail(400, { error: cause.message });
			return fail(400, { error: 'Invitation could not be created. Check the assignment and try again.' });
		}
	},
	revoke: async ({ locals, platform, request }) => {
		requireUserAdmin(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const userId = typeof data.get('userId') === 'string' ? data.get('userId') as string : '';
		if (!userId) return fail(400, { error: 'User is required.' });
		await Promise.all([revokeUserTokens(getDb(platform.env.DB), userId), revokeUserSessions(getDb(platform.env.DB), userId)]);
		return { success: 'Outstanding sign-in links and sessions revoked.' };
	},
	disable: async ({ locals, platform, request }) => {
		requireUserAdmin(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const userId = typeof data.get('userId') === 'string' ? data.get('userId') as string : '';
		if (!userId) return fail(400, { error: 'User is required.' });
		if (userId === locals.principal?.id) return fail(400, { error: 'You cannot disable your own account.' });
		await setUserStatus(getDb(platform.env.DB), userId, 'disabled');
		return { success: 'User disabled and active sessions revoked.' };
	},
	enable: async ({ locals, platform, request }) => {
		requireUserAdmin(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const userId = typeof data.get('userId') === 'string' ? data.get('userId') as string : '';
		if (!userId) return fail(400, { error: 'User is required.' });
		await setUserStatus(getDb(platform.env.DB), userId, 'active');
		return { success: 'User enabled.' };
	},
};
