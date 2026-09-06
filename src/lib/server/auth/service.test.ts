import { describe, expect, it } from 'vitest';
import { isSignInTokenUsable } from './service';

const base = { revokedAt: null, usedAt: null, expiresAt: 2000 };

describe('sign-in token policy', () => {
	it('accepts only an unused, unrevoked, unexpired token', () => {
		expect(isSignInTokenUsable(base, 1000)).toBe(true);
		expect(isSignInTokenUsable({ ...base, usedAt: 1000 }, 1000)).toBe(false);
		expect(isSignInTokenUsable({ ...base, revokedAt: 1000 }, 1000)).toBe(false);
		expect(isSignInTokenUsable(base, 2000)).toBe(false);
	});
});
