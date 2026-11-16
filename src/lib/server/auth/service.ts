import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { normalizeEmail, randomToken, sha256 } from './crypto';
import type { EmailProvider } from './email';
import { allowAuthRequest } from './rate-limit';
import type { Principal } from './capabilities';

export const SESSION_COOKIE = 'wsmc_session';
export const SIGN_IN_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type InviteAssignment =
	| { kind: 'statewide' }
	| { kind: 'regional'; regionNumber: number }
	| { kind: 'coach'; schoolId: string }
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
	input: { userId: string; purpose?: 'invite' | 'sign_in'; now?: number; ttlMs?: number; channel?: 'email' | 'qr' },
) {
	const now = input.now ?? Date.now();
	const expiresAt = now + (input.ttlMs ?? SIGN_IN_TOKEN_TTL_MS);
	const rawToken = randomToken();
	const id = crypto.randomUUID();
	const insert = db.insert(schema.signInTokens).values({
		id,
		userId: input.userId,
		tokenHash: await sha256(rawToken),
		purpose: input.purpose ?? 'sign_in',
		channel: input.channel ?? 'email',
		expiresAt,
		createdAt: now,
	});
	if (input.channel === 'qr') {
		await insert;
	} else {
		// Retain the newest three email links, so delayed mail remains useful.
		await db.batch([insert, db.update(schema.signInTokens).set({ revokedAt: now }).where(sql`
			${schema.signInTokens.id} IN (
				SELECT id FROM sign_in_tokens WHERE user_id = ${input.userId} AND channel = 'email'
				AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ${now}
				ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET 3
			)`)]);
	}
	return { id, rawToken, expiresAt };
}

export async function sendSignInLink(
	db: Database,
	provider: EmailProvider,
	input: { userId: string; email: string; origin: string; purpose?: 'invite' | 'sign_in'; now?: number },
) {
	if (!await allowAuthRequest(db, 'email', input.userId, input.now)) {
		throw new AuthError('rate_limited', 'A sign-in email was recently requested. Please wait one minute before trying again.');
	}
	const token = await issueSignInToken(db, input);
	try {
		await provider.sendSignInLink({ to: input.email, url: `${input.origin}/auth/callback/${token.rawToken}`, expiresAt: token.expiresAt });
	} catch (cause) {
		await db.update(schema.signInTokens).set({ revokedAt: Date.now() }).where(eq(schema.signInTokens.id, token.id));
		throw cause;
	}
	return token;
}

/** Add permissions to an existing account without sending or invalidating a sign-in link. */
export async function addUserAssignments(
	db: Database,
	input: { userId: string; assignments: InviteAssignment[]; actorUserId: string; now?: number },
) {
	const [user] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId));
	if (!user) throw new AuthError('user_not_found', 'User not found.');
	if (user.status === 'disabled') throw new AuthError('user_disabled', 'Enable this user before adding access.');
	await attachAssignments(db, user.id, input.assignments, input.now ?? Date.now(), input.actorUserId);
	return { user };
}

/** Create accounts and grant access without issuing credentials or sending email. */
export async function addPerson(
	db: Database,
	input: { email: string; displayName?: string; assignments: InviteAssignment[]; actorUserId: string },
) {
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new AuthError('invalid_request', 'Enter a valid email address.');
	const existing = await findUserByEmail(db, input.email);
	if (existing) {
		const { user } = await addUserAssignments(db, { userId: existing.id, assignments: input.assignments, actorUserId: input.actorUserId });
		return { user, created: false };
	}
	if (!input.displayName?.trim()) throw new AuthError('invalid_request', 'Name is required for a new account.');
	const now = Date.now();
	const [user] = await db.insert(schema.users).values({ id: crypto.randomUUID(), email: normalizeEmail(input.email), displayName: input.displayName.trim(), status: 'pending', createdAt: now, updatedAt: now }).returning();
	await attachAssignments(db, user.id, input.assignments, now, input.actorUserId);
	return { user, created: true };
}

async function attachAssignments(db: Database, userId: string, assignments: InviteAssignment[], now: number, actorUserId: string): Promise<void> {
	for (const assignment of assignments) {
		let grant;
		switch (assignment.kind) {
			case 'statewide':
				grant = db.insert(schema.statewideAssignments).values({ userId, createdAt: now }).onConflictDoNothing();
				break;
			case 'regional':
				grant = db.insert(schema.regionalCoordinatorAssignments).values({ userId, regionNumber: assignment.regionNumber, createdAt: now }).onConflictDoNothing();
				break;
			case 'coach':
				grant = db.insert(schema.coachAssignments).values({ userId, schoolId: assignment.schoolId, createdAt: now }).onConflictDoNothing();
				break;
			case 'scorekeeper':
				grant = db.insert(schema.scorekeeperAssignments).values({ userId, contestId: assignment.contestId, createdAt: now }).onConflictDoNothing();
				break;
		}
		await db.batch([grant, assignmentAudit(db, userId, assignment, actorUserId, 'assignment_granted', now)]);
	}
}

export async function consumeSignInToken(db: Database, rawToken: string, now = Date.now()): Promise<{ sessionId: string; userId: string; expiresAt: number }> {
	const [token] = await db.select().from(schema.signInTokens).where(eq(schema.signInTokens.tokenHash, await sha256(rawToken)));
	if (!token || !isSignInTokenUsable(token, now)) {
		throw new AuthError('invalid_token', 'This sign-in link is invalid or expired.');
	}

	const [user] = await db.select().from(schema.users).where(eq(schema.users.id, token.userId));
	if (!user || user.status === 'disabled') throw new AuthError('user_disabled', 'This account is disabled.');

	const claim = db.update(schema.signInTokens).set({ usedAt: now }).where(
		and(eq(schema.signInTokens.id, token.id), isNull(schema.signInTokens.usedAt), isNull(schema.signInTokens.revokedAt), gt(schema.signInTokens.expiresAt, now)),
	).returning({ id: schema.signInTokens.id });
	const [updated] = await db.batch([claim,
		// Revoke sibling email links atomically with the claim, preventing parallel use.
		db.update(schema.signInTokens).set({ revokedAt: now }).where(and(
			eq(schema.signInTokens.userId, user.id), eq(schema.signInTokens.channel, 'email'),
			isNull(schema.signInTokens.usedAt), isNull(schema.signInTokens.revokedAt),
			sql`changes() = 1`,
		)),
	]);
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

export type AssignmentKey = InviteAssignment & { userId: string };

/** Runs immediately after the assignment write in the same atomic D1 batch.
 * changes() suppresses audit events for duplicate grants or absent revocations.
 * SELECT order follows auditEvents' insert columns, including nullable context. */
function assignmentAudit(db: Database, userId: string, assignment: InviteAssignment, actorUserId: string, action: string, now: number) {
	const { kind } = assignment;
	const scope = kind === 'regional' ? { regionNumber: assignment.regionNumber }
		: kind === 'coach' ? { schoolId: assignment.schoolId }
		: kind === 'scorekeeper' ? { contestId: assignment.contestId } : {};
	return db.insert(schema.auditEvents).select(sql`SELECT ${crypto.randomUUID()}, ${actorUserId},
		${kind === 'scorekeeper' ? assignment.contestId : null},
		${kind === 'coach' ? assignment.schoolId : null},
		'access_assignment', ${userId}, ${action}, ${JSON.stringify({ kind, ...scope })}, ${now}
		WHERE changes() > 0`);
}

export async function removeAssignment(db: Database, assignment: AssignmentKey, actorUserId: string): Promise<void> {
	let revoke;
	switch (assignment.kind) {
		case 'statewide':
			revoke = db.delete(schema.statewideAssignments).where(eq(schema.statewideAssignments.userId, assignment.userId));
			break;
		case 'regional':
			revoke = db.delete(schema.regionalCoordinatorAssignments).where(and(eq(schema.regionalCoordinatorAssignments.userId, assignment.userId), eq(schema.regionalCoordinatorAssignments.regionNumber, assignment.regionNumber)));
			break;
		case 'coach':
			revoke = db.delete(schema.coachAssignments).where(and(eq(schema.coachAssignments.userId, assignment.userId), eq(schema.coachAssignments.schoolId, assignment.schoolId)));
			break;
		case 'scorekeeper':
			revoke = db.delete(schema.scorekeeperAssignments).where(and(eq(schema.scorekeeperAssignments.userId, assignment.userId), eq(schema.scorekeeperAssignments.contestId, assignment.contestId)));
			break;
	}
	await db.batch([revoke, assignmentAudit(db, assignment.userId, assignment, actorUserId, 'assignment_revoked', Date.now())]);
}

/** Sessions are touched at most this often: a write on every request would spend the D1 daily write allowance on bookkeeping. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** Runs on every request. One D1 round trip resolves the session and all four assignment kinds. */
export async function loadPrincipal(db: Database, sessionId: string | undefined, now = Date.now()): Promise<Principal | null> {
	if (!sessionId) return null;
	// Each assignment lookup re-derives the user from the session, so the whole principal fits one batch.
	const sessionUser = db.select({ userId: schema.sessions.userId }).from(schema.sessions)
		.innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
		.where(and(eq(schema.sessions.id, sessionId), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, now), eq(schema.users.status, 'active')));
	const [[session], statewide, regional, coach, scorekeeper] = await db.batch([
		db.select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName, lastSeenAt: schema.sessions.lastSeenAt }).from(schema.sessions)
			.innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
			.where(and(eq(schema.sessions.id, sessionId), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, now), eq(schema.users.status, 'active'))),
		db.select({ userId: schema.statewideAssignments.userId }).from(schema.statewideAssignments).where(inArray(schema.statewideAssignments.userId, sessionUser)),
		db.select({ contestId: schema.contests.id }).from(schema.regionalCoordinatorAssignments)
			.innerJoin(schema.regions, eq(schema.regions.number, schema.regionalCoordinatorAssignments.regionNumber))
			.innerJoin(schema.contests, and(eq(schema.contests.regionId, schema.regions.id), eq(schema.contests.kind, 'regional')))
			.where(inArray(schema.regionalCoordinatorAssignments.userId, sessionUser)),
		db.select({ schoolId: schema.coachAssignments.schoolId }).from(schema.coachAssignments).where(inArray(schema.coachAssignments.userId, sessionUser)),
		db.select({ contestId: schema.scorekeeperAssignments.contestId }).from(schema.scorekeeperAssignments).where(inArray(schema.scorekeeperAssignments.userId, sessionUser)),
	]);
	if (!session) return null;
	if (now - session.lastSeenAt >= SESSION_TOUCH_INTERVAL_MS) {
		await db.update(schema.sessions).set({ lastSeenAt: now }).where(eq(schema.sessions.id, sessionId));
	}
	return {
		id: session.id,
		email: session.email,
		displayName: session.displayName,
		isAdmin: statewide.length > 0,
		regionalContestIds: regional.map((assignment) => assignment.contestId),
		coachAssignments: coach,
		scorekeeperContestIds: scorekeeper.map((assignment) => assignment.contestId),
	};
}

export async function findUserByEmail(db: Database, email: string) {
	const [user] = await db.select().from(schema.users).where(eq(schema.users.email, normalizeEmail(email)));
	return user;
}
