import { describe, expect, it } from 'vitest';
import { ParticipationError, inviteSchool } from './participation';

describe('contest participation rules', () => {
	it('validates division before database access', async () => {
		await expect(inviteSchool({} as never, { contestId: 'contest-1', schoolId: 'school-1', division: 3 })).rejects.toMatchObject({ code: 'invalid_division' });
	});

	it('rejects invitations after roster lock', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [{ lifecycle: 'roster_locked' }] }) }) };
		await expect(inviteSchool(db as never, { contestId: 'contest-1', schoolId: 'school-1', division: 1 })).rejects.toBeInstanceOf(ParticipationError);
	});
});
