import { describe, expect, it } from 'vitest';
import { finalizeContest, getFinalizationReport, ScoringError, validateScoreInput } from './service';

describe('score validation', () => {
	it('keeps blank scores distinct from zero', () => {
		expect(validateScoreInput('project', {})).toMatchObject({ score: null });
		expect(validateScoreInput('project', { score: 0 })).toMatchObject({ score: 0 });
	});

	it('derives topical totals only when both parts are present', () => {
		expect(validateScoreInput('topical_individual', { part1: 20 })).toMatchObject({ score: null, part1: 20, part2: null });
		expect(validateScoreInput('topical_individual', { part1: 0, part2: 0 })).toMatchObject({ score: 0, part1: 0, part2: 0 });
	});

	it('enforces category-specific ranges and shapes', () => {
		expect(() => validateScoreInput('topical_team', { part1: 76, part2: 1 })).toThrowError(ScoringError);
		expect(() => validateScoreInput('project', { score: 1, placement: 1 })).toThrowError(/one numeric score/);
		expect(() => validateScoreInput('knowdown', { placement: 5 })).toThrowError(/1 through 4/);
	});

	it('distinguishes missing, eliminated, and placed Knowdown outcomes', () => {
		expect(validateScoreInput('knowdown', {})).toMatchObject({ knowdownOutcome: null, placement: null });
		expect(validateScoreInput('knowdown', { knowdownOutcome: 'eliminated' })).toMatchObject({ knowdownOutcome: 'eliminated', placement: null });
		expect(validateScoreInput('knowdown', { knowdownOutcome: 'placed', placement: 4 })).toMatchObject({ knowdownOutcome: 'placed', placement: 4 });
		expect(() => validateScoreInput('knowdown', { knowdownOutcome: 'placed' })).toThrowError(/Enter a final place/);
	});

	it('checks Knowdown outcome completeness and unique places for a six-person field', async () => {
		const finalRows = [
			...([1, 2, 3, 4] as const).map((placement) => ({ entry: { id: `place-${placement}`, category: 'knowdown', entryNumber: placement, division: 1 }, result: { placement, knowdownOutcome: 'placed', version: 1 }, schoolName: 'Alpha' })),
			...(['eliminated-a', 'eliminated-b'] as const).map((id) => ({ entry: { id, category: 'knowdown', entryNumber: 3, division: 1 }, result: { placement: null, knowdownOutcome: 'eliminated', version: 1 }, schoolName: 'Beta' })),
		];
		const makeDb = (rows: typeof finalRows) => {
			let query = 0;
			return { select: () => ({ from: () => {
				const current = query++;
				if (current === 0) return { where: async () => [{ id: 'contest-1', kind: 'regional', seasonId: 'season-1', lifecycle: 'scoring' }] };
				const joined = { leftJoin: () => joined, where: async () => rows };
				return joined;
			} }) } as never;
		};
		const complete = await getFinalizationReport(makeDb(finalRows), 'contest-1');
		expect(complete.complete).toBe(true);
		expect(complete.missing).toEqual([]);
		expect(complete.duplicateKnowdownPlaces).toEqual([]);

		const duplicateRows = finalRows.map((row) => row.entry.id === 'eliminated-a' ? { ...row, result: { placement: 2, knowdownOutcome: 'placed', version: 1 } } : row);
		const duplicateReport = await getFinalizationReport(makeDb(duplicateRows as typeof finalRows), 'contest-1');
		expect(duplicateReport.complete).toBe(false);
		expect(duplicateReport.duplicateKnowdownPlaces).toEqual([{ placement: 2, entryIds: ['place-2', 'eliminated-a'] }]);
		await expect(finalizeContest(makeDb(duplicateRows as typeof finalRows), { contestId: 'contest-1', actorUserId: 'coordinator-1' }))
			.rejects.toMatchObject({ code: 'duplicate_placement' });
	});
});
