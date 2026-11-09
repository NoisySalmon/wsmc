import { describe, expect, it } from 'vitest';
import { actions } from './+page.server';

const scorekeeper = {
	id: 'user-scorekeeper', email: 'scorekeeper@example.com', displayName: 'Scorekeeper',
	statewideSeasonIds: [], regionalContestIds: [], coachAssignments: [], scorekeeperContestIds: ['contest-1'],
};

function inviteEvent(principal: object) {
	return {
		locals: { principal, sessionId: 'session-1' },
		platform: undefined,
		url: new URL('https://wsmc.example/admin/users'),
		request: new Request('https://wsmc.example/admin/users?/add', { method: 'POST', body: new URLSearchParams({ email: 'new@example.com', displayName: 'New User', role: 'statewide' }) }),
	};
}

describe('user administration authorization', () => {
	it('rejects scorekeepers from account administration', async () => {
		await expect(actions.add(inviteEvent(scorekeeper) as never)).rejects.toMatchObject({ status: 403 });
	});
});
