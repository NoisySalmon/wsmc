import { describe, expect, it } from 'vitest';
import { canCoachRespondForSchool, canManageParticipationResponse } from '$lib/server/program/participation-access';
import type { Principal } from '$lib/server/auth/capabilities';
import { load } from './+page.server';

const principal = (overrides: Partial<Principal> = {}): Principal => ({
	id: 'user', email: 'coach@example.test', displayName: 'Coach', statewideSeasonIds: [], regionalContestIds: [],
	coachAssignments: [{ seasonId: 'season-1', schoolId: 'school-1' }], scorekeeperContestIds: [], ...overrides,
});

describe('coach participation response access', () => {
	it('limits a coach to assigned school and season', () => {
		const coach = principal();
		expect(canCoachRespondForSchool(coach, 'school-1', 'season-1')).toBe(true);
		expect(canCoachRespondForSchool(coach, 'school-2', 'season-1')).toBe(false);
		expect(canCoachRespondForSchool(coach, 'school-1', 'season-2')).toBe(false);
	});

	it('allows coordinators to respond for their contest, including an uncoached school', () => {
		const regional = principal({ coachAssignments: [], regionalContestIds: ['contest-1'] });
		expect(canManageParticipationResponse(regional, { contestId: 'contest-1', schoolId: 'school-2', seasonId: 'season-1' })).toBe(true);
		expect(canManageParticipationResponse(regional, { contestId: 'contest-2', schoolId: 'school-2', seasonId: 'season-1' })).toBe(false);
	});

	it('returns an HTTP 401 for a signed-out coach page request', async () => {
		await expect(load({ locals: { principal: null }, platform: {} } as never)).rejects.toMatchObject({ status: 401 });
	});
});
