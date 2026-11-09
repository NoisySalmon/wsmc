import { describe, expect, it } from 'vitest';
import { ProgramError, createSeason, setContestLifecycle, setSeasonStatus, updateContestDate } from './service';
import { schema } from '$lib/server/db';

describe('program setup rules', () => {
	it('rejects invalid season input before writing', async () => {
		await expect(createSeason({} as never, { year: 1999 })).rejects.toMatchObject({ code: 'invalid_year' });
	});

	it('atomically creates a season with all known regions and a setup contest for each', async () => {
		const operations: { table: unknown; values: any }[] = [];
		const db = {
			select: () => { const query = { innerJoin: () => query, where: async () => [] }; return { from: () => query }; },
			insert: (table: unknown) => ({ values: (values: unknown) => {
				const operation = { table, values };
				return {
					...operation,
					returning: () => operation,
				};
			} }),
			batch: async (batch: typeof operations) => {
				operations.push(...batch);
				return [[batch[0].values], [], []];
			},
		};
		const season = await createSeason(db as never, {
			year: 2027, now: 1234,
		});
		expect(operations.map((operation) => operation.table)).toEqual([schema.seasons, schema.regions, ...Array(12).fill(schema.contests)]);
		expect(season).toMatchObject({ year: 2027, createdAt: 1234 });
		const regions = operations[1].values;
		expect(regions.map(({ number, name }: { number: number; name: string }) => [number, name])).toEqual([
			[1, 'Spokane area'], [2, 'Tri Cities'], [3, 'North Central'], [4, 'Yakima area'],
			[5, 'Northwest'], [6, 'Seattle area'], [7, 'Tacoma area'], [8, 'Southwest'],
			[9, 'Olympia Area'], [10, 'Peninsula'], [11, 'Virtual'],
		]);
		expect(new Set(regions.map((region: { id: string }) => region.id)).size).toBe(11);
		const contests = operations.slice(2).map((operation) => operation.values);
		expect(contests).toHaveLength(12);
		expect(contests.filter(c => c.kind === 'state')).toEqual([expect.objectContaining({ seasonId: season.id, regionId: null, lifecycle: 'setup' })]);
		for (const region of regions) {
			expect(region.seasonId).toBe(season.id);
			expect(contests).toContainEqual(expect.objectContaining({
				seasonId: season.id, regionId: region.id, kind: 'regional', lifecycle: 'setup',
				name: `Region ${region.number} — ${region.name}`, startsAt: null, createdAt: 1234,
			}));
		}
	});

	it('reports a failed season bootstrap instead of returning a partially configured season', async () => {
		const db = {
			select: () => { const query = { innerJoin: () => query, where: async () => [] }; return { from: () => query }; },
			insert: () => ({ values: () => ({ returning: () => ({}) }) }),
			batch: async () => { throw new Error('bootstrap failed'); },
		};
		await expect(createSeason(db as never, { year: 2027 })).rejects.toThrow('bootstrap failed');
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
	it('requires archiving the existing season before another can be created', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [{ id: 'current' }] }) }) };
		await expect(createSeason(db as never, { year: 2027 })).rejects.toMatchObject({ code: 'active_season' });
	});

	it.each([
		['regional', 'state', 'invalid_transition'],
		['state', 'qualifications', 'invalid_transition'],
		['archived', 'regional', 'archived'],
		['regional', 'qualifications', 'incomplete'],
	])('rejects season progression from %s to %s', async (from, to, code) => {
		const rows = [[{ id:'season-1', status:from }], [{ lifecycle:'scoring' }]];
		const db = { select: () => ({ from: () => ({ where: async () => rows.shift() }) }) };
		await expect(setSeasonStatus(db as never, 'season-1', to as never)).rejects.toMatchObject({ code });
	});

	it.each(['2026-02-30', 'not-a-date'])('rejects invalid calendar date %s', async date => {
		await expect(updateContestDate({} as never, 'contest', date)).rejects.toMatchObject({ code:'invalid_date' });
	});

});
