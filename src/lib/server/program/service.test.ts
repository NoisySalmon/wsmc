import { describe, expect, it } from 'vitest';
import { ProgramError, createContest, createSeason, setContestLifecycle } from './service';

describe('program setup rules', () => {
	it('rejects invalid season input before writing', async () => {
		await expect(createSeason({} as never, { year: 1999, name: 'Old' })).rejects.toMatchObject({ code: 'invalid_year' });
		await expect(createSeason({} as never, { year: 2026, name: '   ' })).rejects.toMatchObject({ code: 'invalid_request' });
	});

	it('requires a region only for regional contests', async () => {
		const select = () => ({ from: () => ({ where: async () => [{ id: 'season-1', status: 'setup' }] }) });
		const db = { select, insert: () => ({ values: () => ({ returning: async () => [] }) }) };
		await expect(createContest(db as never, { seasonId: 'season-1', kind: 'state', regionId: 'region-1', name: 'State' })).rejects.toMatchObject({ code: 'invalid_region' });
		await expect(createContest(db as never, { seasonId: 'season-1', kind: 'regional', name: 'Regional' })).rejects.toMatchObject({ code: 'invalid_region' });
	});

	it('requires explicit state contest policies', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [{ id: 'season-1', status: 'setup' }] }) }) };
		await expect(createContest(db as never, { seasonId: 'season-1', kind: 'state', name: 'State' })).rejects.toMatchObject({ code: 'invalid_settings' });
	});

	it('does not allow lifecycle rollback', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [{ lifecycle: 'scoring' }] }) }) };
		await expect(setContestLifecycle(db as never, 'contest-1', 'roster_locked')).rejects.toBeInstanceOf(ProgramError);
	});
});
