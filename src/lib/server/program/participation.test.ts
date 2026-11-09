import { describe, expect, it } from 'vitest';
import { assignSchool } from './participation';

describe('contest participation rules', () => {
	it('validates division before database access', async () => {
		await expect(assignSchool({} as never, { contestId: 'contest-1', schoolId: 'school-1', division: 3 })).rejects.toMatchObject({ code: 'invalid_division' });
	});

	it('rejects assignments after roster lock', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [{ kind: 'regional', lifecycle: 'roster_locked' }] }) }) };
		await expect(assignSchool(db as never, { contestId: 'contest-1', schoolId: 'school-1', division: 1 })).rejects.toMatchObject({ code: 'locked' });
	});
});
