import { describe, expect, it } from 'vitest';
import { normalizeEmail, randomToken, sha256 } from './crypto';

describe('auth crypto helpers', () => {
	it('normalizes email addresses', () => {
		expect(normalizeEmail('  Coach@Example.COM ')).toBe('coach@example.com');
	});

	it('creates URL-safe random tokens and stable SHA-256 hashes', async () => {
		const token = randomToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(token).not.toBe(randomToken());
		expect(await sha256('abc')).toBe(await sha256('abc'));
		expect(await sha256('abc')).not.toBe(await sha256('abd'));
	});
});
