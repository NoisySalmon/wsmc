import { describe, expect, it } from 'vitest';
import { actions, load } from './+page.server';

const unauthenticated = { principal: null, sessionId: null };
const request = new Request('https://wsmc.example/state/state-1', { method: 'POST' });

function event() {
	return { locals: unauthenticated, platform: undefined, params: { contestId: 'state-1' }, request };
}

describe('state administration endpoint authorization', () => {
	it('rejects an unauthenticated load before touching the database', async () => {
		await expect(load(event() as never)).rejects.toMatchObject({ status: 401 });
	});

	it('rejects every state mutation before touching the database', async () => {
		for (const action of Object.values(actions)) {
			await expect(action(event() as never)).rejects.toMatchObject({ status: 401 });
		}
	});
});
