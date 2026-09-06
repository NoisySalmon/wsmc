import { describe, expect, it } from 'vitest';
import { sha256 } from './crypto';
import { AuthError, consumeSignInToken, isSignInTokenUsable, issueSignInToken } from './service';

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
});
