import { describe, expect, it } from 'vitest';
import { canCoachSchool } from '$lib/server/auth/capabilities';
import type { Principal } from '$lib/server/auth/capabilities';
import { load } from './+page.server';

const principal = (overrides: Partial<Principal> = {}): Principal => ({
	id: 'user', email: 'coach@example.test', displayName: 'Coach', statewideSeasonIds: [], regionalContestIds: [],
	coachAssignments: [{ seasonId: 'season-1', schoolId: 'school-1' }], scorekeeperContestIds: [], ...overrides,
});

describe('coach school access', () => {
	it('limits a coach to assigned school and season', () => {
		const coach = principal();
		expect(canCoachSchool(coach, 'school-1', 'season-1')).toBe(true);
		expect(canCoachSchool(coach, 'school-2', 'season-1')).toBe(false);
		expect(canCoachSchool(coach, 'school-1', 'season-2')).toBe(false);
	});

	it('returns an HTTP 401 for a signed-out coach page request', async () => {
		await expect(load({ locals: { principal: null }, platform: {} } as never)).rejects.toMatchObject({ status: 401 });
	});
});
