import { describe, expect, it } from 'vitest';
import { sha256 } from './crypto';
import { AuthError, consumeSignInToken, inviteUser, isSignInTokenUsable, issueSignInToken, loadPrincipal, removeAssignment, setUserStatus } from './service';

const base = { revokedAt: null, usedAt: null, expiresAt: 2000 };

describe('sign-in token policy', () => {
	it('accepts only an unused, unrevoked, unexpired token', () => {
		expect(isSignInTokenUsable(base, 1000)).toBe(true);
		expect(isSignInTokenUsable({ ...base, usedAt: 1000 }, 1000)).toBe(false);
		expect(isSignInTokenUsable({ ...base, revokedAt: 1000 }, 1000)).toBe(false);
		expect(isSignInTokenUsable(base, 2000)).toBe(false);
	});

	it('stores only a hash when issuing a token', async () => {
		let inserted: Record<string, unknown> | undefined;
		const db = { insert: () => ({ values: async (values: Record<string, unknown>) => { inserted = values; } }) };
		const result = await issueSignInToken(db as never, { userId: 'user-1', now: 1000, ttlMs: 5000 });
		expect(inserted?.userId).toBe('user-1');
		expect(inserted?.tokenHash).toBe(await sha256(result.rawToken));
		expect(inserted?.tokenHash).not.toBe(result.rawToken);
		expect(inserted?.expiresAt).toBe(6000);
	});

	it('consumes a token once and creates a long-lived session', async () => {
		const rawToken = 'raw-token-for-test';
		const selectResults = [
			[{ id: 'token-1', userId: 'user-1', tokenHash: await sha256(rawToken), purpose: 'sign_in', expiresAt: 2000, usedAt: null, revokedAt: null, createdAt: 1000 }],
			[{ id: 'user-1', email: 'coach@example.com', displayName: 'Coach', status: 'active' }],
		];
		const inserted: Record<string, unknown>[] = [];
		const db = {
			select: () => ({ from: () => ({ where: async () => selectResults.shift() ?? [] }) }),
			update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 'token-1' }] }) }) }),
			insert: () => ({ values: async (values: Record<string, unknown>) => { inserted.push(values); } }),
		};
		const session = await consumeSignInToken(db as never, rawToken, 1500);
		expect(session.userId).toBe('user-1');
		expect(inserted[0]?.userId).toBe('user-1');
		expect(inserted[0]?.expiresAt).toBe(1500 + 30 * 24 * 60 * 60 * 1000);

		const replayDb = {
			select: () => ({ from: () => ({ where: async () => [{ id: 'token-1', userId: 'user-1', tokenHash: await sha256(rawToken), purpose: 'sign_in', expiresAt: 2000, usedAt: 1500, revokedAt: null, createdAt: 1000 }] }) }),
		};
		await expect(consumeSignInToken(replayDb as never, rawToken, 1600)).rejects.toBeInstanceOf(AuthError);
	});

	it('rejects expired and disabled-account tokens before creating sessions', async () => {
		const expiredDb = {
			select: () => ({ from: () => ({ where: async () => [{ id: 'token-1', userId: 'user-1', expiresAt: 1000, usedAt: null, revokedAt: null }] }) }),
		};
		await expect(consumeSignInToken(expiredDb as never, 'expired', 1000)).rejects.toMatchObject({ code: 'invalid_token' });

		const disabledRows = [
			[{ id: 'token-1', userId: 'user-1', expiresAt: 3000, usedAt: null, revokedAt: null }],
			[{ id: 'user-1', status: 'disabled' }],
		];
		const disabledDb = {
			select: () => ({ from: () => ({ where: async () => disabledRows.shift() ?? [] }) }),
		};
		await expect(consumeSignInToken(disabledDb as never, 'disabled', 1000)).rejects.toMatchObject({ code: 'user_disabled' });
	});

	it('disables a user and revokes outstanding access', async () => {
		const calls: string[] = [];
		const db = {
			update: () => ({
				set: (values: Record<string, unknown>) => {
					if (values.status === 'disabled') calls.push('disable');
					return { where: async () => { calls.push('update'); } };
				},
			}),
		};
		await setUserStatus(db as never, 'user-1', 'disabled', 3000);
		expect(calls).toEqual(['disable', 'update', 'update', 'update']);
	});

	it('invites once and preserves multiple assignments without exposing a token', async () => {
		const inserted: Record<string, unknown>[] = [];
		const sent: { to: string; url: string }[] = [];
		const db = {
			select: () => ({ from: () => ({ where: async () => [] }) }),
			insert: () => ({
				values: (values: Record<string, unknown>) => {
					inserted.push(values);
					return {
						returning: async () => [{ ...values }],
						onConflictDoNothing: async () => undefined,
					};
				},
			}),
			update: () => ({ set: () => ({ where: async () => undefined }) }),
		};
		const provider = { sendSignInLink: async (message: { to: string; url: string }) => { sent.push(message); } };
		const result = await inviteUser(db as never, provider, {
			email: ' COACH@Example.COM ',
			displayName: 'Coach',
			origin: 'https://wsmc.example',
			now: 1000,
			assignments: [
				{ kind: 'coach', seasonId: 'season-2026', schoolId: 'school-alpha' },
				{ kind: 'scorekeeper', contestId: 'contest-region-1' },
			],
		});
		expect(result.user.email).toBe('coach@example.com');
		expect(inserted.filter((row) => row.userId === result.user.id)).toHaveLength(3);
		expect(sent[0]?.to).toBe('coach@example.com');
		expect(sent[0]?.url).toBe(`https://wsmc.example/auth/callback/${result.token.rawToken}`);
		expect(inserted.find((row) => row.purpose === 'invite')?.tokenHash).not.toBe(result.token.rawToken);
	});

	it('loads overlapping and multi-school assignments into one principal', async () => {
		const rows = [
			[{ session: { id: 'session-1' }, user: { id: 'user-1', email: 'coach@example.com', displayName: 'Coach' } }],
			[{ seasonId: null }, { seasonId: 'season-2026' }],
			[{ contestId: 'contest-region-1' }],
			[{ seasonId: 'season-2026', schoolId: 'school-alpha' }, { seasonId: 'season-2026', schoolId: 'school-beta' }],
			[{ contestId: 'contest-region-1' }],
		];
		const db = {
			select: () => ({
				from: () => ({
					innerJoin: () => ({ where: async () => rows.shift() ?? [] }),
					where: async () => rows.shift() ?? [],
				}),
			}),
			update: () => ({ set: () => ({ where: async () => undefined }) }),
		};
		const principal = await loadPrincipal(db as never, 'session-1', 1000);
		expect(principal?.statewideSeasonIds).toEqual([null, 'season-2026']);
		expect(principal?.regionalContestIds).toEqual(['contest-region-1']);
		expect(principal?.coachAssignments).toEqual([{ seasonId: 'season-2026', schoolId: 'school-alpha' }, { seasonId: 'season-2026', schoolId: 'school-beta' }]);
		expect(principal?.scorekeeperContestIds).toEqual(['contest-region-1']);
	});

	it('removes a scoped assignment without affecting another assignment type', async () => {
		const deleted: unknown[] = [];
		const db = { delete: (table: unknown) => ({ where: async (condition: unknown) => { deleted.push({ table, condition }); } }) };
		await removeAssignment(db as never, { kind: 'regional', userId: 'user-1', contestId: 'contest-1' });
		expect(deleted).toHaveLength(1);
	});
});
