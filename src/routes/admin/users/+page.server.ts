import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { defaultRegions } from '$lib/server/program/default-regions';
import { qrActions } from '$lib/server/auth/qr';
import { canAdministerUsers } from '$lib/server/auth/capabilities';
import { createEmailProvider, resolveAppOrigin } from '$lib/server/auth/email';
import {
	AuthError,
	addPerson,
	sendSignInLink,
	type InviteAssignment,
	removeAssignment,
	revokeUserSessions,
	revokeUserTokens,
	setUserStatus,
} from '$lib/server/auth/service';
import { getDb, schema } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

function requireUserAdmin(locals: App.Locals): void {
	if (!locals.principal || !canAdministerUsers(locals.principal)) throw error(403, 'Administrator access required.');
}

function requiredText(value: FormDataEntryValue | null, label: string): string {
	const result = typeof value === 'string' ? value.trim() : '';
	if (!result) throw new AuthError('invalid_request', `${label} is required.`);
	return result;
}

function textValue(value: FormDataEntryValue | null): string {
	return typeof value === 'string' ? value.trim() : '';
}

function readAssignment(data: FormData): InviteAssignment {
	const role = requiredText(data.get('role'), 'Assignment');
	switch (role) {
		case 'statewide': return { kind: 'statewide' };
		case 'regional': {
			const regionNumber = Number(requiredText(data.get('regionNumber'), 'Region'));
			if (!defaultRegions.some(region => region.number === regionNumber)) throw new AuthError('invalid_request', 'Choose a valid region.');
			return { kind: 'regional', regionNumber };
		}
		case 'coach': return { kind: 'coach', schoolId: requiredText(data.get('schoolId'), 'School') };
		case 'scorekeeper': return { kind: 'scorekeeper', contestId: requiredText(data.get('contestId'), 'Contest') };
		default: throw new AuthError('invalid_request', 'Choose a valid assignment.');
	}
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireUserAdmin(locals);
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [users, contests, schools, statewideAssignments, regionalAssignments, coachAssignments, scorekeeperAssignments] = await Promise.all([
		db.select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName, status: schema.users.status, createdAt: schema.users.createdAt }).from(schema.users),
		db.select({ id: schema.contests.id, name: schema.contests.name, kind: schema.contests.kind }).from(schema.contests),
		db.select({ id: schema.schools.id, name: schema.schools.name }).from(schema.schools).where(eq(schema.schools.active, true)),
		db.select().from(schema.statewideAssignments),
		db.select().from(schema.regionalCoordinatorAssignments),
		db.select().from(schema.coachAssignments),
		db.select().from(schema.scorekeeperAssignments),
	]);
	return { users, regions: defaultRegions, contests, schools, assignments: { statewide: statewideAssignments, regional: regionalAssignments, coach: coachAssignments, scorekeeper: scorekeeperAssignments } };
};

export const actions: Actions = {
	...qrActions('admin'),
	add: async ({ locals, platform, request, url }) => {
		requireUserAdmin(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		try {
			const email = requiredText(data.get('email'), 'Email');
			const result = await addPerson(getDb(platform.env.DB), createEmailProvider(platform.env), {
				email,
				actorUserId: locals.principal!.id,
				displayName: textValue(data.get('displayName')),
				assignments: [readAssignment(data)],
				origin: resolveAppOrigin(platform.env, url.origin),
			});
			return { success: result.invited ? `Invitation sent to ${result.user.email}.` : `Access added for ${result.user.email}. No email was sent.` };
		} catch (cause) {
			if (cause instanceof AuthError) return fail(400, { error: cause.message });
			return fail(400, { error: 'Access could not be added. Check the assignment and try again.' });
		}
	},
	resend: async ({ locals, platform, request, url }) => {
		requireUserAdmin(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		const data = await request.formData();
		const [user] = await db.select().from(schema.users).where(eq(schema.users.id, textValue(data.get('userId'))));
		if (!user || user.status !== 'pending') return fail(400, { error: 'Choose a pending account.' });
		await sendSignInLink(db, createEmailProvider(platform.env), { userId: user.id, email: user.email, origin: resolveAppOrigin(platform.env, url.origin), purpose: 'invite' });
		return { success: `Invitation resent to ${user.email}. Earlier outstanding links have been replaced.` };
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
	removeAssignment: async ({ locals, platform, request }) => {
		requireUserAdmin(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const userId = requiredText(data.get('userId'), 'User');
		const kind = requiredText(data.get('assignmentKind'), 'Assignment');
		if (userId === locals.principal?.id && kind === 'statewide') return fail(400, { error: 'You cannot remove your own administrator access.' });
		try {
			data.set('role', kind);
			await removeAssignment(getDb(platform.env.DB), {
				...readAssignment(data), userId,
			}, locals.principal!.id);
			return { success: 'Assignment removed.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof AuthError ? cause.message : 'Assignment could not be removed.' });
		}
	},
};
