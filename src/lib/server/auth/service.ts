import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { normalizeEmail, randomToken, sha256 } from './crypto';
import type { EmailProvider } from './email';
import type { Principal } from './capabilities';

export const SESSION_COOKIE = 'wsmc_session';
export const SIGN_IN_TOKEN_TTL_MS = 20 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type InviteAssignment =
	| { kind: 'statewide'; seasonId: string | null }
	| { kind: 'regional'; contestId: string }
	| { kind: 'coach'; seasonId: string; schoolId: string }
	| { kind: 'scorekeeper'; contestId: string };

export class AuthError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'AuthError';
	}
}

export function isSignInTokenUsable(token: { revokedAt: number | null; usedAt: number | null; expiresAt: number }, now: number): boolean {
	return token.revokedAt === null && token.usedAt === null && token.expiresAt > now;
}

export async function issueSignInToken(
	db: Database,
	input: { userId: string; purpose?: 'invite' | 'sign_in'; now?: number; ttlMs?: number },
) {
	const now = input.now ?? Date.now();
	const expiresAt = now + (input.ttlMs ?? SIGN_IN_TOKEN_TTL_MS);
	const rawToken = randomToken();
	await db.insert(schema.signInTokens).values({
		id: crypto.randomUUID(),
		userId: input.userId,
		tokenHash: await sha256(rawToken),
		purpose: input.purpose ?? 'sign_in',
		expiresAt,
		createdAt: now,
	});
	return { rawToken, expiresAt };
}

export async function sendSignInLink(
	db: Database,
	provider: EmailProvider,
	input: { userId: string; email: string; origin: string; purpose?: 'invite' | 'sign_in'; now?: number },
) {
	await revokeUserTokens(db, input.userId, input.now);
	const token = await issueSignInToken(db, input);
	await provider.sendSignInLink({ to: input.email, url: `${input.origin}/auth/callback/${token.rawToken}`, expiresAt: token.expiresAt });
	return token;
}

/** Create or update an invited user and attach all requested assignments. */
export async function inviteUser(
	db: Database,
	provider: EmailProvider,
	input: { email: string; displayName?: string; assignments: InviteAssignment[]; origin: string; now?: number },
) {
	const email = normalizeEmail(input.email);
	const now = input.now ?? Date.now();
	let user = await findUserByEmail(db, email);
	if (user?.status === 'disabled') throw new AuthError('user_disabled', 'Disabled users cannot be invited until re-enabled.');
	if (!user) {
		[user] = await db.insert(schema.users).values({ id: crypto.randomUUID(), email, displayName: input.displayName ?? '', status: 'pending', createdAt: now, updatedAt: now }).returning();
	} else if (input.displayName && input.displayName !== user.displayName) {
		[user] = await db.update(schema.users).set({ displayName: input.displayName, updatedAt: now }).where(eq(schema.users.id, user.id)).returning();
	}

	for (const assignment of input.assignments) {
		switch (assignment.kind) {
			case 'statewide':
				await db.insert(schema.statewideAssignments).values({ id: crypto.randomUUID(), userId: user.id, seasonId: assignment.seasonId, createdAt: now }).onConflictDoNothing();
				break;
			case 'regional':
				await db.insert(schema.regionalCoordinatorAssignments).values({ userId: user.id, contestId: assignment.contestId, createdAt: now }).onConflictDoNothing();
				break;
			case 'coach':
				await db.insert(schema.coachAssignments).values({ userId: user.id, seasonId: assignment.seasonId, schoolId: assignment.schoolId, createdAt: now }).onConflictDoNothing();
				break;
			case 'scorekeeper':
				await db.insert(schema.scorekeeperAssignments).values({ userId: user.id, contestId: assignment.contestId, createdAt: now }).onConflictDoNothing();
				break;
		}
	}

	const token = await sendSignInLink(db, provider, { userId: user.id, email: user.email, origin: input.origin, purpose: 'invite', now });
	return { user, token };
}

export async function consumeSignInToken(db: Database, rawToken: string, now = Date.now()): Promise<{ sessionId: string; userId: string; expiresAt: number }> {
	const [token] = await db.select().from(schema.signInTokens).where(eq(schema.signInTokens.tokenHash, await sha256(rawToken)));
	if (!token || !isSignInTokenUsable(token, now)) {
		throw new AuthError('invalid_token', 'This sign-in link is invalid or expired.');
	}

	const [user] = await db.select().from(schema.users).where(eq(schema.users.id, token.userId));
	if (!user || user.status === 'disabled') throw new AuthError('user_disabled', 'This account is disabled.');

	const updated = await db.update(schema.signInTokens).set({ usedAt: now }).where(
		and(eq(schema.signInTokens.id, token.id), isNull(schema.signInTokens.usedAt), isNull(schema.signInTokens.revokedAt)),
	).returning({ id: schema.signInTokens.id });
	if (updated.length !== 1) throw new AuthError('token_replayed', 'This sign-in link has already been used.');

	const sessionId = randomToken(32);
	const expiresAt = now + SESSION_TTL_MS;
	await db.insert(schema.sessions).values({ id: sessionId, userId: user.id, expiresAt, createdAt: now, lastSeenAt: now });
	await db.update(schema.users).set({ status: 'active', updatedAt: now }).where(eq(schema.users.id, user.id));
	return { sessionId, userId: user.id, expiresAt };
}

export async function revokeSession(db: Database, sessionId: string, now = Date.now()): Promise<void> {
	await db.update(schema.sessions).set({ revokedAt: now }).where(and(eq(schema.sessions.id, sessionId), isNull(schema.sessions.revokedAt)));
}

export async function revokeUserSessions(db: Database, userId: string, now = Date.now()): Promise<void> {
	await db.update(schema.sessions).set({ revokedAt: now }).where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
}

export async function revokeUserTokens(db: Database, userId: string, now = Date.now()): Promise<void> {
	await db.update(schema.signInTokens).set({ revokedAt: now }).where(and(eq(schema.signInTokens.userId, userId), isNull(schema.signInTokens.usedAt), isNull(schema.signInTokens.revokedAt)));
}

export async function setUserStatus(db: Database, userId: string, status: 'pending' | 'active' | 'disabled', now = Date.now()): Promise<void> {
	await db.update(schema.users).set({ status, updatedAt: now }).where(eq(schema.users.id, userId));
	if (status === 'disabled') {
		await revokeUserTokens(db, userId, now);
		await revokeUserSessions(db, userId, now);
	}
}

export async function loadPrincipal(db: Database, sessionId: string | undefined, now = Date.now()): Promise<Principal | null> {
	if (!sessionId) return null;
	const [session] = await db.select({ session: schema.sessions, user: schema.users }).from(schema.sessions)
		.innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
		.where(and(eq(schema.sessions.id, sessionId), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, now), eq(schema.users.status, 'active')));
	if (!session) return null;
	await db.update(schema.sessions).set({ lastSeenAt: now }).where(eq(schema.sessions.id, sessionId));

	const [statewide, regional, coach, scorekeeper] = await Promise.all([
		db.select({ seasonId: schema.statewideAssignments.seasonId }).from(schema.statewideAssignments).where(eq(schema.statewideAssignments.userId, session.user.id)),
		db.select({ contestId: schema.regionalCoordinatorAssignments.contestId }).from(schema.regionalCoordinatorAssignments).where(eq(schema.regionalCoordinatorAssignments.userId, session.user.id)),
		db.select({ schoolId: schema.coachAssignments.schoolId }).from(schema.coachAssignments).where(eq(schema.coachAssignments.userId, session.user.id)),
		db.select({ contestId: schema.scorekeeperAssignments.contestId }).from(schema.scorekeeperAssignments).where(eq(schema.scorekeeperAssignments.userId, session.user.id)),
	]);
	return {
		id: session.user.id,
		email: session.user.email,
		displayName: session.user.displayName,
		statewideSeasonIds: statewide.map((assignment) => assignment.seasonId),
		regionalContestIds: regional.map((assignment) => assignment.contestId),
		coachedSchoolIds: coach.map((assignment) => assignment.schoolId),
		scorekeeperContestIds: scorekeeper.map((assignment) => assignment.contestId),
	};
}

export async function findUserByEmail(db: Database, email: string) {
	const [user] = await db.select().from(schema.users).where(eq(schema.users.email, normalizeEmail(email)));
	return user;
}
