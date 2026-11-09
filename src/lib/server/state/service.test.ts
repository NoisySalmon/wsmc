import { describe, expect, it } from 'vitest';
import { createStateEntry, StateError } from './service';

function contestDb() {
	let call = 0;
	return { select: () => ({ from: () => ({ where: async () => ++call === 1 ? [{ id:'state-1', kind:'state', lifecycle:'registration_open', seasonId:'season-1' }] : [{ status:'state' }] }) }) } as never;
}

describe('state administration rules', () => {
	it('rejects malformed category values at the service boundary', async () => {
		const db = contestDb();
		await expect(createStateEntry(db, { contestId: 'state-1', category: 'not-a-category' as never, division: 1, actorUserId: 'user-1' })).rejects.toMatchObject({ code: 'invalid_category' });
	});

	it('exposes a stable state-domain error type', () => {
		expect(new StateError('example', 'example')).toBeInstanceOf(Error);
	});
	it.each(['regional', 'qualifications', 'archived'])('blocks state roster writes during %s', async status => {
		let call = 0;
		const db = { select: () => ({ from: () => ({ where: async () => ++call === 1 ? [{ id:'state-1', kind:'state', lifecycle:'registration_open', seasonId:'season-1' }] : [{ status }] }) }) };
		await expect(createStateEntry(db as never, { contestId:'state-1', category:'team_contest', division:1, actorUserId:'user' })).rejects.toMatchObject({ code:'locked' });
	});

});
