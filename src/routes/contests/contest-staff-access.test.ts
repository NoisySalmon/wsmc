import { describe, expect, it } from 'vitest';
import { canManageRegionalContestStaff } from './contest-staff-access';
import type { Principal } from '$lib/server/auth/capabilities';

const principal = (overrides: Partial<Principal> = {}): Principal => ({
	id: 'user', email: 'user@example.test', displayName: 'User', isAdmin: false, regionalContestIds: [], coachAssignments: [], scorekeeperContestIds: [], ...overrides,
});
const contest = { id: 'contest-1', seasonId: 'season-1', kind: 'regional' };

describe('regional contest scorekeeper management access', () => {
	it('allows administrators and coordinators assigned to the contest', () => {
		expect(canManageRegionalContestStaff(principal({ regionalContestIds: ['contest-1'] }), contest)).toBe(true);
		expect(canManageRegionalContestStaff(principal({ isAdmin: true }), contest)).toBe(true);
	});

	it('denies out-of-scope coordinators, coaches, and scorekeepers', () => {
		expect(canManageRegionalContestStaff(principal({ regionalContestIds: ['contest-2'] }), contest)).toBe(false);
		expect(canManageRegionalContestStaff(principal({ coachAssignments: [{ schoolId: 'school-1' }] }), contest)).toBe(false);
		expect(canManageRegionalContestStaff(principal({ scorekeeperContestIds: ['contest-1'] }), contest)).toBe(false);
	});

	it('does not expose scorekeeper management for state contests', () => {
		expect(canManageRegionalContestStaff(principal({ isAdmin: true }), { ...contest, kind: 'state' })).toBe(false);
	});
});
