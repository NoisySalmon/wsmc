import { describe, expect, it } from 'vitest';
import { _canViewRegionalContestOverview as canViewRegionalContestOverview } from './[contestId]/+page.server';
import type { Principal } from '$lib/server/auth/capabilities';

const regional: Principal = {
	id: 'regional', email: 'regional@example.test', displayName: 'Regional',
	isAdmin: false, regionalContestIds: ['region-1'], coachAssignments: [], scorekeeperContestIds: [],
};
const scorekeeper: Principal = {
	id: 'scorer', email: 'scorer@example.test', displayName: 'Scorer',
	isAdmin: false, regionalContestIds: [], coachAssignments: [], scorekeeperContestIds: ['region-1'],
};
const coach: Principal = {
	id: 'coach', email: 'coach@example.test', displayName: 'Coach',
	isAdmin: false, regionalContestIds: [], coachAssignments: [{ schoolId: 'school-1' }], scorekeeperContestIds: [],
};

describe('regional contest overview access', () => {
	const regionalContest = { id: 'region-1', seasonId: 'season-1', kind: 'regional' };
	it('allows the assigned regional coordinator and scorekeeper', () => {
		expect(canViewRegionalContestOverview(regional, regionalContest)).toBe(true);
		expect(canViewRegionalContestOverview(scorekeeper, regionalContest)).toBe(true);
	});
	it('does not expose all schools and roster names to a coach or unrelated user', () => {
		expect(canViewRegionalContestOverview(coach, regionalContest)).toBe(false);
		expect(canViewRegionalContestOverview({ ...regional, regionalContestIds: [] }, regionalContest)).toBe(false);
	});
	it('does not serve the regional overview route for a state contest', () => {
		expect(canViewRegionalContestOverview(regional, { ...regionalContest, kind: 'state' })).toBe(false);
	});
});
