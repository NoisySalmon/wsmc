import { describe, expect, it } from 'vitest';
import { canAdministerSchool, canAdministerUsers, canCoachSchool, canCoordinateRegion, canCoordinateState, canEditRoster, canFinalizeContest, canScoreContest, type Principal } from './capabilities';

const assignedPrincipal: Principal = {
	id: 'user-1', email: 'user@example.com', displayName: 'User',
	isAdmin: true, regionalContestIds: ['contest-2'], coachAssignments: [{ schoolId: 'school-1' }], scorekeeperContestIds: ['contest-3'],
};

describe('assignment capabilities', () => {
	it('grants administrators access across seasons', () => {
		expect(canCoordinateState(assignedPrincipal, 'season-1')).toBe(true);
		expect(canCoordinateState(assignedPrincipal, 'season-2')).toBe(true);
		expect(canAdministerUsers(assignedPrincipal)).toBe(true);
	});

	it('allows scoped regional and scorekeeper access without granting statewide access', () => {
		const principal = { ...assignedPrincipal, isAdmin: false };
		expect(canCoordinateRegion(principal, 'contest-2', 'season-2')).toBe(true);
		expect(canScoreContest(principal, 'contest-3', 'season-2')).toBe(true);
		expect(canScoreContest(principal, 'contest-4', 'season-2')).toBe(false);
		expect(canFinalizeContest(principal, 'contest-3', 'season-2')).toBe(false);
		expect(canScoreContest({ ...principal, isAdmin: false, regionalContestIds: [], scorekeeperContestIds: ['contest-3'] }, 'contest-3', 'season-2')).toBe(true);
		expect(canFinalizeContest({ ...principal, isAdmin: false, regionalContestIds: [], scorekeeperContestIds: ['contest-3'] }, 'contest-3', 'season-2')).toBe(false);
	});

	it('supports a coach assigned to a school', () => {
		const principal = { ...assignedPrincipal, isAdmin: false };
		expect(canCoachSchool(principal, 'school-1')).toBe(true);
		expect(canCoachSchool(principal, 'school-1', 'season-1')).toBe(true);
		expect(canCoachSchool(principal, 'school-1', 'season-2')).toBe(true);
		expect(canCoachSchool({ ...principal, coachAssignments: [{ schoolId: 'school-1' }, { schoolId: 'school-2' }] }, 'school-2', 'season-1')).toBe(true);
		expect(canAdministerSchool(principal, 'contest-4', 'school-1', 'season-2')).toBe(true);
		expect(canEditRoster(principal, 'contest-4', 'school-1', 'season-2')).toBe(true);
		expect(canAdministerSchool(principal, 'contest-4', 'school-2', 'season-2')).toBe(false);
	});
});
