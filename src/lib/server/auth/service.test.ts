import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { getDb } from '$lib/server/db';
import { sha256 } from './crypto';
import { addPerson, consumeSignInToken, issueSignInToken, loadPrincipal, removeAssignment, revokeSession, sendSignInLink, SESSION_TOUCH_INTERVAL_MS, setUserStatus } from './service';
import { allowAuthRequest } from './rate-limit';
import { issueQrSignIn } from './qr';

let worker: Miniflare;
let d1: D1Database;
let db: ReturnType<typeof getDb>;
const now = Date.now();
const userId = 'user-coach-gamma';
const admin = { id: 'user-coordinator', email: 'coordinator@wsmc.example', displayName: 'Admin', isAdmin: true, regionalContestIds: [], coachAssignments: [], scorekeeperContestIds: [] };

beforeAll(async () => {
	worker = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', compatibilityDate: '2026-03-10', d1Databases: ['DB'] });
	d1 = await worker.getD1Database('DB') as unknown as D1Database;
	for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
		for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await d1.prepare(statement).run();
	}
	for (const statement of readFileSync('scripts/seed.sql', 'utf8').split(';').map(s => s.trim()).filter(Boolean)) await d1.prepare(statement).run();
	db = getDb(d1);
});
afterAll(async () => { await worker?.dispose(); });
beforeEach(async () => {
	await d1.batch([
		d1.prepare('DELETE FROM sign_in_tokens'), d1.prepare('DELETE FROM sessions'), d1.prepare('DELETE FROM auth_request_limits'),
		d1.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(userId),
	]);
});

describe('passwordless account access in D1', () => {
	it('creates accounts and multiple assignments silently, preserving existing names and access', async () => {
		const created = await addPerson(db, { email: ' NEW@Example.COM ', displayName: 'New Coach', actorUserId: admin.id, assignments: [{ kind: 'coach', schoolId: 'school-alpha' }, { kind: 'scorekeeper', contestId: 'contest-region-1' }] });
		expect(created.user).toMatchObject({ email: 'new@example.com', status: 'pending' });
		expect((await d1.prepare('SELECT * FROM sign_in_tokens').all()).results).toHaveLength(0);
		const existing = await addPerson(db, { email: 'new@example.com', displayName: 'Replacement', actorUserId: admin.id, assignments: [{ kind: 'coach', schoolId: 'school-beta' }, { kind: 'statewide' }, { kind: 'regional', regionNumber: 1 }] });
		expect(existing.user.displayName).toBe('New Coach');
		const token = await issueSignInToken(db, { userId: created.user.id, now });
		const session = await consumeSignInToken(db, token.rawToken, now + 1);
		const principal = await loadPrincipal(db, session.sessionId, now + 2);
		expect(principal?.coachAssignments.map(row => row.schoolId).sort()).toEqual(['school-alpha', 'school-beta']);
		expect(principal?.scorekeeperContestIds).toEqual(['contest-region-1']);
		expect(principal?.isAdmin).toBe(true);
		expect(principal?.regionalContestIds).toEqual(['contest-region-1']);
		await removeAssignment(db, { kind: 'coach', schoolId: 'school-alpha', userId: created.user.id }, admin.id);
		expect((await loadPrincipal(db, session.sessionId, now + 3))?.coachAssignments).toEqual([{ schoolId: 'school-beta' }]);
	});

	it('sends 24-hour hashed email links, throttles concurrent sends, and preserves delayed mail and QR codes', async () => {
		const messages: { to: string; url: string; expiresAt: number }[] = [];
		const provider = { sendSignInLink: async (message: typeof messages[number]) => { messages.push(message); } };
		const input = { userId, email: 'gamma@example.com', origin: 'https://wsmc.example', now };
		const requests = await Promise.allSettled([sendSignInLink(db, provider, input), sendSignInLink(db, provider, input)]);
		expect(requests.filter(r => r.status === 'fulfilled')).toHaveLength(1);
		expect(messages).toHaveLength(1);
		expect(messages[0].expiresAt).toBe(now + 86_400_000);
		const rawToken = messages[0].url.split('/').at(-1)!;
		expect(await d1.prepare('SELECT token_hash FROM sign_in_tokens').first('token_hash')).toBe(await sha256(rawToken));
		const qr = await issueQrSignIn(db, admin, { userId, origin: input.origin });
		await sendSignInLink(db, provider, { ...input, now: now + 60_000 });
		expect(await d1.prepare('SELECT COUNT(*) AS n FROM sign_in_tokens WHERE used_at IS NULL AND revoked_at IS NULL').first('n')).toBe(3);
		await consumeSignInToken(db, rawToken, now + 60_001);
		await expect(consumeSignInToken(db, messages[1].url.split('/').at(-1)!, now + 60_002)).rejects.toMatchObject({ code: 'invalid_token' });
		// Email use does not invalidate the independently issued QR.
		await expect(consumeSignInToken(db, qr.signInUrl.split('/').at(-1)!, now + 60_003)).resolves.toMatchObject({ userId });
	});

	it('bounds outstanding email links to three and makes parallel sibling consumption single-use', async () => {
		const tokens = [];
		for (let i = 0; i < 4; i++) tokens.push(await issueSignInToken(db, { userId, now: now + i }));
		await expect(consumeSignInToken(db, tokens[0].rawToken, now + 10)).rejects.toMatchObject({ code: 'invalid_token' });
		const results = await Promise.allSettled(tokens.slice(1, 3).map(token => consumeSignInToken(db, token.rawToken, now + 10)));
		expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
		expect(await d1.prepare('SELECT COUNT(*) AS n FROM sessions').first('n')).toBe(1);
		await expect(consumeSignInToken(db, tokens[3].rawToken, now + 11)).rejects.toMatchObject({ code: 'invalid_token' });
	});

	it('enforces expiry, activates pending accounts, and revokes tokens and sessions when disabled', async () => {
		await d1.prepare("UPDATE users SET status = 'pending' WHERE id = ?").bind(userId).run();
		const expired = await issueSignInToken(db, { userId, now: now - 86_400_000 });
		await expect(consumeSignInToken(db, expired.rawToken, now)).rejects.toMatchObject({ code: 'invalid_token' });
		const token = await issueSignInToken(db, { userId, now });
		const session = await consumeSignInToken(db, token.rawToken, now + 1);
		expect(session.expiresAt).toBe(now + 1 + 30 * 86_400_000);
		expect(await d1.prepare('SELECT status FROM users WHERE id = ?').bind(userId).first('status')).toBe('active');
		await expect(consumeSignInToken(db, token.rawToken, now + 2)).rejects.toMatchObject({ code: 'invalid_token' });
		const unused = await issueSignInToken(db, { userId, now: now + 3 });
		await setUserStatus(db, userId, 'disabled', now + 4);
		expect(await loadPrincipal(db, session.sessionId, now + 5)).toBeNull();
		await expect(consumeSignInToken(db, unused.rawToken, now + 5)).rejects.toMatchObject({ code: 'invalid_token' });
		await expect(addPerson(db, { email: 'coach@gamma.example', actorUserId: admin.id, assignments: [] })).rejects.toMatchObject({ code: 'user_disabled' });
		const disabledToken = await issueSignInToken(db, { userId, now: now + 6 });
		await expect(consumeSignInToken(db, disabledToken.rawToken, now + 7)).rejects.toMatchObject({ code: 'user_disabled' });
	});

	it('cleans up failed deliveries without invalidating an earlier usable email', async () => {
		const first = await issueSignInToken(db, { userId, now });
		await expect(sendSignInLink(db, { sendSignInLink: async () => { throw new Error('Unavailable'); } }, { userId, email: 'gamma@example.com', origin: 'https://wsmc.example', now: now + 1 })).rejects.toThrow('Unavailable');
		expect(await d1.prepare('SELECT COUNT(*) AS n FROM sign_in_tokens WHERE revoked_at IS NULL').first('n')).toBe(1);
		await expect(consumeSignInToken(db, first.rawToken, now + 2)).resolves.toMatchObject({ userId });
	});

	it('limits public requests by shared IP, resets after ten minutes, and keeps identities independent', async () => {
		const requests = await Promise.all(Array.from({ length: 61 }, () => allowAuthRequest(db, 'ip', '192.0.2.1', now)));
		expect(requests.filter(Boolean)).toHaveLength(60);
		expect(await allowAuthRequest(db, 'ip', '192.0.2.2', now)).toBe(true);
		expect(await allowAuthRequest(db, 'ip', '192.0.2.1', now + 599_999)).toBe(false);
		expect(await allowAuthRequest(db, 'ip', '192.0.2.1', now + 600_000)).toBe(true);
		const keys = (await d1.prepare('SELECT key FROM auth_request_limits').all<{ key: string }>()).results;
		expect(keys.every(row => !row.key.includes('192.0.2.'))).toBe(true);
	});
});

describe('per-request principal loading', () => {
	it('touches a session at most once per interval and rejects revoked or expired sessions', async () => {
		const token = await issueSignInToken(db, { userId, now });
		const session = await consumeSignInToken(db, token.rawToken, now + 1);
		const lastSeen = () => d1.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').bind(session.sessionId).first('last_seen_at');
		expect(await loadPrincipal(db, session.sessionId, now + 60_000)).toMatchObject({ id: userId, isAdmin: false });
		expect(await lastSeen()).toBe(now + 1);
		await loadPrincipal(db, session.sessionId, now + 1 + SESSION_TOUCH_INTERVAL_MS);
		expect(await lastSeen()).toBe(now + 1 + SESSION_TOUCH_INTERVAL_MS);
		expect(await loadPrincipal(db, 'unknown-session', now + 2)).toBeNull();
		expect(await loadPrincipal(db, session.sessionId, session.expiresAt)).toBeNull();
		await revokeSession(db, session.sessionId, now + 3);
		expect(await loadPrincipal(db, session.sessionId, now + 4)).toBeNull();
	});
});
