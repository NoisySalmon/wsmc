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

	it('rejects a regional contest whose selected region belongs to another season', async () => {
		const rows = [[{ id: 'season-1', status: 'setup' }], []];
		const db = { select: () => ({ from: () => ({ where: async () => rows.shift() ?? [] }) }) };
		await expect(createContest(db as never, { seasonId: 'season-1', kind: 'regional', regionId: 'region-from-season-2', name: 'Regional' }))
			.rejects.toMatchObject({ code: 'invalid_region', message: 'Region does not belong to this season.' });
	});

	it('requires explicit state contest policies', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [{ id: 'season-1', status: 'setup' }] }) }) };
		await expect(createContest(db as never, { seasonId: 'season-1', kind: 'state', name: 'State' })).rejects.toMatchObject({ code: 'invalid_settings' });
	});

	it('does not allow lifecycle rollback', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [{ lifecycle: 'scoring' }] }) }) };
		await expect(setContestLifecycle(db as never, 'contest-1', 'season-1', 'roster_locked')).rejects.toBeInstanceOf(ProgramError);
	});

	it.each(['regional', 'state'] as const)('requires Scoring workflow to finalize a %s contest', async (kind) => {
		const db = {
			select: () => ({ from: () => ({ where: async () => [{ lifecycle: 'scoring', kind }] }) }),
			update: () => { throw new Error('Program lifecycle must not write a finalized state.'); },
		};
		await expect(setContestLifecycle(db as never, 'contest-1', 'season-1', 'finalized'))
			.rejects.toMatchObject({ code: 'scoring_required', message: expect.stringContaining('Publish results there as a separate step') });
	});

	it('requires the contest to belong to the supplied season scope', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [] }) }) };
		await expect(setContestLifecycle(db as never, 'contest-1', 'other-season', 'registration_open')).rejects.toMatchObject({ code: 'not_found' });
	});
});
