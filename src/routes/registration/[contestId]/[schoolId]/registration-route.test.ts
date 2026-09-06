import { describe, expect, it } from 'vitest';
import { actions, load } from './+page.server';

const unauthenticated = { principal: null, sessionId: null };

describe('regional registration endpoint authorization', () => {
	it('rejects unauthenticated page loads before touching the database', async () => {
		await expect(load({ locals: unauthenticated, platform: undefined, params: { contestId: 'contest-1', schoolId: 'school-1' } } as never)).rejects.toMatchObject({ status: 401 });
	});

	it('rejects unauthenticated mutation posts before touching the database', async () => {
		await expect(actions.addStudent({ locals: unauthenticated, platform: undefined, params: { contestId: 'contest-1', schoolId: 'school-1' }, request: new Request('https://wsmc.example', { method: 'POST' }) } as never)).rejects.toMatchObject({ status: 401 });
	});
});
