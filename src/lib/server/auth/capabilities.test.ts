import { describe, expect, it } from 'vitest';
import { canAdministerSchool, canAdministerUsers, canCoachSchool, canCoordinateRegion, canCoordinateState, canScoreContest, type Principal } from './capabilities';

const principal: Principal = {
	id: 'user-1', email: 'user@example.com', displayName: 'User',
	statewideSeasonIds: ['season-1'], regionalContestIds: ['contest-2'], coachedSchoolIds: ['school-1'], scorekeeperContestIds: ['contest-3'],
};

describe('assignment capabilities', () => {
	it('recognizes season-scoped statewide coordination', () => {
		expect(canCoordinateState(principal, 'season-1')).toBe(true);
		expect(canCoordinateState(principal, 'season-2')).toBe(false);
		expect(canAdministerUsers(principal)).toBe(false);
		expect(canAdministerUsers({ ...principal, statewideSeasonIds: [null] })).toBe(true);
	});

	it('allows scoped regional and scorekeeper access without granting statewide access', () => {
		expect(canCoordinateRegion(principal, 'contest-2', 'season-2')).toBe(true);
		expect(canScoreContest(principal, 'contest-3', 'season-2')).toBe(true);
		expect(canScoreContest(principal, 'contest-4', 'season-2')).toBe(false);
	});

	it('supports a coach assigned to a school', () => {
		expect(canCoachSchool(principal, 'school-1')).toBe(true);
		expect(canCoachSchool({ ...principal, coachedSchoolIds: ['school-1', 'school-2'] }, 'school-2')).toBe(true);
		expect(canAdministerSchool(principal, 'contest-4', 'school-1', 'season-2')).toBe(true);
		expect(canAdministerSchool(principal, 'contest-4', 'school-2', 'season-2')).toBe(false);
	});
});
