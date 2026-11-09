import { and, eq, isNull } from 'drizzle-orm';
import qrcode from 'qrcode-generator';
import { getDb, schema, type Database } from '$lib/server/db';
import { canAdministerUsers, type Principal } from './capabilities';
import { AuthError, issueSignInToken, revokeUserTokens } from './service';
import { resolveAppOrigin } from './email';
import { error, fail, type Actions } from '@sveltejs/kit';

const QR_TTL_MS = 5 * 60 * 1000;

// A QR signs into the whole account, not merely its assignment in this contest.
async function authorizeTarget(db: Database, actor: Principal | null, userId: string, contestId?: string) {
	if (!actor) throw error(401, 'Sign in required.');
	const admin = canAdministerUsers(actor);
	if (!admin && (!contestId || !actor.regionalContestIds.includes(contestId))) throw error(403, 'Coordinator access required.');
	if (contestId) {
		const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
		if (!contest || contest.kind !== 'regional') throw error(403, 'Regional contest required.');
		if (!admin) {
			const [statewide, regional, scorekeeper, coach] = await Promise.all([
				db.select().from(schema.statewideAssignments).where(eq(schema.statewideAssignments.userId, userId)),
				db.select().from(schema.regionalCoordinatorAssignments).where(eq(schema.regionalCoordinatorAssignments.userId, userId)),
				db.select().from(schema.scorekeeperAssignments).where(and(eq(schema.scorekeeperAssignments.userId, userId), eq(schema.scorekeeperAssignments.contestId, contestId))),
				db.select().from(schema.coachAssignments)
					.innerJoin(schema.schoolParticipations, eq(schema.schoolParticipations.schoolId, schema.coachAssignments.schoolId))
					.where(and(eq(schema.coachAssignments.userId, userId), eq(schema.coachAssignments.seasonId, contest.seasonId), eq(schema.schoolParticipations.contestId, contestId))),
			]);
			if (statewide.length || regional.length) throw error(403, 'An administrator must generate sign-in codes for accounts with coordinator access.');
			if (!scorekeeper.length && !coach.length) throw error(403, 'Person is not assigned here.');
		}
	}
	const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
	if (!user || user.status === 'disabled') throw new AuthError('invalid_user', 'Choose an enabled account.');
	return user;
}

export async function issueQrSignIn(db: Database, actor: Principal | null, input: { userId: string; origin: string; contestId?: string }) {
	const user = await authorizeTarget(db, actor, input.userId, input.contestId);
	await revokeUserTokens(db, user.id);
	const token = await issueSignInToken(db, { userId: user.id, ttlMs: QR_TTL_MS });
	const qr = qrcode(0, 'M');
	const signInUrl = `${input.origin}/auth/callback/${token.rawToken}`;
	qr.addData(signInUrl);
	qr.make();
	// Encode locally: no sign-in credential is sent to an external QR service.
	const image = `data:image/svg+xml,${encodeURIComponent(qr.createSvgTag({ cellSize: 6, margin: 24 }))}`;
	await db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: actor!.id, contestId: input.contestId ?? null, entityType: 'user', entityId: user.id, action: 'qr_sign_in_issued' });
	return { image, signInUrl, tokenId: token.id, userId: user.id, email: user.email, displayName: user.displayName, expiresAt: token.expiresAt };
}

export async function revokeQrSignIn(db: Database, actor: Principal | null, input: { userId: string; tokenId: string; contestId?: string }) {
	await authorizeTarget(db, actor, input.userId, input.contestId);
	await db.update(schema.signInTokens).set({ revokedAt: Date.now() }).where(and(
		eq(schema.signInTokens.id, input.tokenId), eq(schema.signInTokens.userId, input.userId), isNull(schema.signInTokens.usedAt), isNull(schema.signInTokens.revokedAt),
	));
}

/** Each page supplies its scope; never take a contest scope from submitted data. */
export function qrActions(scope: 'admin' | 'contest') {
	return {
		qr: async ({ locals, platform, params, request, url, setHeaders }) => {
			setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
			if (!platform?.env.DB) throw error(503, 'Database unavailable.');
			const data = await request.formData();
			try {
				return { qr: await issueQrSignIn(getDb(platform.env.DB), locals.principal, {
					userId: String(data.get('userId') ?? ''), origin: resolveAppOrigin(platform.env, url.origin),
					contestId: scope === 'contest' ? params.contestId : undefined,
				}) };
			} catch (cause) {
				if (cause instanceof AuthError) return fail(400, { error: cause.message });
				throw cause;
			}
		},
		revokeQr: async ({ locals, platform, params, request, setHeaders }) => {
			setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
			if (!platform?.env.DB) throw error(503, 'Database unavailable.');
			const data = await request.formData();
			try {
				await revokeQrSignIn(getDb(platform.env.DB), locals.principal, {
					userId: String(data.get('userId') ?? ''), tokenId: String(data.get('tokenId') ?? ''),
					contestId: scope === 'contest' ? params.contestId : undefined,
				});
				return { success: 'Sign-in code closed and revoked. A code already used does not sign the person out.' };
			} catch (cause) {
				if (cause instanceof AuthError) return fail(400, { error: cause.message });
				throw cause;
			}
		},
	} satisfies Actions;
}
