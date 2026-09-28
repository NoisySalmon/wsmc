import { describe, expect, it } from 'vitest';
import { ProgramError, createContest, createRegionWithContest, createSeason, ensureStateContest, setContestLifecycle, updateRegion, updateStateSettings } from './service';

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

	it('creates a region and its regional contest together', async () => {
		const calls: string[] = [];
		const db = {
			select: () => ({ from: () => ({ where: async () => [{ id: 'season-1', status: 'setup' }] }) }),
			insert: (table: unknown) => ({ values: (values: unknown) => ({ returning: async () => { calls.push(JSON.stringify(values)); return [{ id: `new-${calls.length}`, number: 3, name: 'East', seasonId: 'season-1', ...(values as object) }]; } }) }),
			delete: () => ({ where: async () => [] }),
		};
		const result = await createRegionWithContest(db as never, { seasonId: 'season-1', number: 3, name: 'East' });
		expect(result.region).toMatchObject({ seasonId: 'season-1' });
		expect(result.contest).toMatchObject({ kind: 'regional', seasonId: 'season-1' });
		expect(calls.length).toBe(2);
	});

	it('returns the existing state contest instead of creating a second one', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [{ id: 'contest-state', kind: 'state' }] }) }) };
		const contest = await ensureStateContest(db as never, { seasonId: 'season-1' });
		expect(contest).toMatchObject({ id: 'contest-state' });
	});

	it('rejects state policy updates for non-state contests', async () => {
		const db = {
			select: () => ({ from: () => ({ where: async () => [{ id: 'contest-1', kind: 'regional' }] }) }),
		};
		await expect(updateStateSettings(db as never, { contestId: 'contest-1', topicalIndividualAllowed: true, crossSchoolTopicalTeamsAllowed: false }))
			.rejects.toMatchObject({ code: 'invalid_request' });
	});

	it('rejects region updates that would duplicate a number only at the database layer', async () => {
		const db = {
			select: (table: unknown) => ({ from: () => ({ where: async () => [{ id: 'region-1', seasonId: 'season-1', number: 1, name: 'Old' }] }) }),
			update: () => ({ set: () => ({ where: () => ({ returning: async () => { throw new Error('UNIQUE constraint failed'); } }) }) }),
		};
		await expect(updateRegion(db as never, { regionId: 'region-1', number: 2 })).rejects.toMatchObject({ code: 'duplicate_region' });
	});
});
