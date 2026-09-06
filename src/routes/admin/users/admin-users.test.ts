import { describe, expect, it } from 'vitest';
import { actions } from './+page.server';

const scopedCoordinator = {
	id: 'user-season-coordinator', email: 'season@example.com', displayName: 'Season Coordinator',
	statewideSeasonIds: ['season-2026'], regionalContestIds: [], coachAssignments: [], scorekeeperContestIds: [],
};
const scorekeeper = {
	id: 'user-scorekeeper', email: 'scorekeeper@example.com', displayName: 'Scorekeeper',
	statewideSeasonIds: [], regionalContestIds: [], coachAssignments: [], scorekeeperContestIds: ['contest-1'],
};

function inviteEvent(principal: object) {
	return {
		locals: { principal, sessionId: 'session-1' },
		platform: undefined,
		url: new URL('https://wsmc.example/admin/users'),
		request: new Request('https://wsmc.example/admin/users?/invite', { method: 'POST', body: new URLSearchParams({ email: 'new@example.com', displayName: 'New User', role: 'statewide' }) }),
	};
}

describe('user administration authorization', () => {
	it('rejects season-scoped coordinators from system user administration', async () => {
		await expect(actions.invite(inviteEvent(scopedCoordinator) as never)).rejects.toMatchObject({ status: 403 });
	});

	it('rejects scorekeepers from system user administration', async () => {
		await expect(actions.invite(inviteEvent(scorekeeper) as never)).rejects.toMatchObject({ status: 403 });
	});
});
