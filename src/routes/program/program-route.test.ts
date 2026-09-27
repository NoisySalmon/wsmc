import { describe, expect, it } from 'vitest';
import { actions } from './+page.server';

const coordinator = {
	id: 'state-coordinator', email: 'state@example.com', displayName: 'State Coordinator',
	statewideSeasonIds: ['season-1'], regionalContestIds: [], coachAssignments: [], scorekeeperContestIds: [],
};

describe('Program lifecycle action', () => {
	it('rejects direct finalization with guidance before accessing the database', async () => {
		const request = new Request('https://wsmc.example/program?/setLifecycle', {
			method: 'POST',
			body: new URLSearchParams({ contestId: 'contest-1', seasonId: 'season-1', lifecycle: 'finalized' }),
		});
		const result = await actions.setLifecycle({
			locals: { principal: coordinator, sessionId: 'session-1' },
			platform: undefined,
			request,
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Finalize results from the Scoring page after reviewing completeness. Publish results there as a separate step.' },
		});
	});
});
