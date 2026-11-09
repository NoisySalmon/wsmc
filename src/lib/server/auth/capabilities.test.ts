import { describe, expect, it } from 'vitest';
import { canAdministerSchool, canAdministerUsers, canCoachSchool, canCoordinateRegion, canCoordinateState, canEditRoster, canFinalizeContest, canScoreContest, type Principal } from './capabilities';

const assignedPrincipal: Principal = {
	id: 'user-1', email: 'user@example.com', displayName: 'User',
	statewideSeasonIds: ['season-1'], regionalContestIds: ['contest-2'], coachAssignments: [{ seasonId: 'season-1', schoolId: 'school-1' }], scorekeeperContestIds: ['contest-3'],
};

describe('assignment capabilities', () => {
	it('treats legacy season and system assignments as administrators', () => {
		expect(canCoordinateState(assignedPrincipal, 'season-1')).toBe(true);
		expect(canCoordinateState(assignedPrincipal, 'season-2')).toBe(true);
		expect(canAdministerUsers(assignedPrincipal)).toBe(true);
		expect(canAdministerUsers({ ...assignedPrincipal, statewideSeasonIds: [null] })).toBe(true);
	});

	it('allows scoped regional and scorekeeper access without granting statewide access', () => {
		const principal = { ...assignedPrincipal, statewideSeasonIds: [] };
		expect(canCoordinateRegion(principal, 'contest-2', 'season-2')).toBe(true);
		expect(canScoreContest(principal, 'contest-3', 'season-2')).toBe(true);
		expect(canScoreContest(principal, 'contest-4', 'season-2')).toBe(false);
		expect(canFinalizeContest(principal, 'contest-3', 'season-2')).toBe(false);
		expect(canScoreContest({ ...principal, statewideSeasonIds: [], regionalContestIds: [], scorekeeperContestIds: ['contest-3'] }, 'contest-3', 'season-2')).toBe(true);
		expect(canFinalizeContest({ ...principal, statewideSeasonIds: [], regionalContestIds: [], scorekeeperContestIds: ['contest-3'] }, 'contest-3', 'season-2')).toBe(false);
	});

	it('supports a coach assigned to a school', () => {
		const principal = { ...assignedPrincipal, statewideSeasonIds: [] };
		expect(canCoachSchool(principal, 'school-1')).toBe(true);
		expect(canCoachSchool(principal, 'school-1', 'season-1')).toBe(true);
		expect(canCoachSchool(principal, 'school-1', 'season-2')).toBe(false);
		expect(canCoachSchool({ ...principal, coachAssignments: [{ seasonId: 'season-1', schoolId: 'school-1' }, { seasonId: 'season-1', schoolId: 'school-2' }] }, 'school-2', 'season-1')).toBe(true);
		expect(canAdministerSchool(principal, 'contest-4', 'school-1', 'season-2')).toBe(false);
		expect(canEditRoster(principal, 'contest-4', 'school-1', 'season-2')).toBe(false);
		expect(canAdministerSchool(principal, 'contest-4', 'school-2', 'season-2')).toBe(false);
	});
});
