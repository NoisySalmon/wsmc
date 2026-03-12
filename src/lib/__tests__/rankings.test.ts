import { describe, it, expect } from 'vitest';
import {
	rankByScore,
	rankIndividuals,
	getDistinguishedIndividualIds,
	type RankedEntry,
	type TeamRankingEntry,
	type IndividualRankingEntry,
} from '$lib/rankings';

function makeTeamEntry(overrides: Partial<TeamRankingEntry> & { score: number; division: number }): TeamRankingEntry {
	return {
		teamId: 't-' + Math.random().toString(36).slice(2),
		schoolName: 'School',
		teamNumber: 1,
		members: [],
		...overrides,
	};
}

function makeIndEntry(overrides: Partial<IndividualRankingEntry> & { total: number; division: number; competingGrade: number }): IndividualRankingEntry {
	return {
		studentId: 's-' + Math.random().toString(36).slice(2),
		name: 'Student',
		schoolName: 'School',
		part1: 0,
		part2: overrides.total,
		...overrides,
	};
}

describe('rankByScore', () => {
	it('ranks entries by score descending', () => {
		const entries = [
			makeTeamEntry({ score: 40, division: 1 }),
			makeTeamEntry({ score: 60, division: 1 }),
			makeTeamEntry({ score: 50, division: 1 }),
		];
		const ranked = rankByScore(entries);
		expect(ranked.map((r) => r.score)).toEqual([60, 50, 40]);
		expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
	});

	it('gives equal ranks to tied scores', () => {
		const entries = [
			makeTeamEntry({ score: 50, division: 1 }),
			makeTeamEntry({ score: 50, division: 1 }),
			makeTeamEntry({ score: 40, division: 1 }),
		];
		const ranked = rankByScore(entries);
		expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
	});

	it('filters by division', () => {
		const entries = [
			makeTeamEntry({ score: 60, division: 1 }),
			makeTeamEntry({ score: 55, division: 2 }),
			makeTeamEntry({ score: 50, division: 1 }),
		];
		const div1 = rankByScore(entries, 1);
		expect(div1.length).toBe(2);
		expect(div1.map((r) => r.score)).toEqual([60, 50]);

		const div2 = rankByScore(entries, 2);
		expect(div2.length).toBe(1);
		expect(div2[0].rank).toBe(1);
	});
});

describe('rankIndividuals', () => {
	it('ranks by total descending', () => {
		const entries = [
			makeIndEntry({ total: 100, division: 1, competingGrade: 12 }),
			makeIndEntry({ total: 120, division: 1, competingGrade: 12 }),
			makeIndEntry({ total: 110, division: 1, competingGrade: 12 }),
		];
		const ranked = rankIndividuals(entries);
		expect(ranked.map((r) => r.total)).toEqual([120, 110, 100]);
		expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
	});

	it('filters by grade', () => {
		const entries = [
			makeIndEntry({ total: 100, division: 1, competingGrade: 12 }),
			makeIndEntry({ total: 90, division: 1, competingGrade: 11 }),
			makeIndEntry({ total: 95, division: 1, competingGrade: 12 }),
		];
		const gr12 = rankIndividuals(entries, { grade: 12 });
		expect(gr12.length).toBe(2);
		expect(gr12.map((r) => r.total)).toEqual([100, 95]);
	});

	it('filters by division and grade together', () => {
		const entries = [
			makeIndEntry({ total: 100, division: 1, competingGrade: 12 }),
			makeIndEntry({ total: 95, division: 2, competingGrade: 12 }),
			makeIndEntry({ total: 90, division: 1, competingGrade: 12 }),
		];
		const result = rankIndividuals(entries, { division: 1, grade: 12 });
		expect(result.length).toBe(2);
		expect(result.map((r) => r.total)).toEqual([100, 90]);
	});
});

describe('getDistinguishedIndividualIds', () => {
	it('identifies top student per grade not in top 3 overall', () => {
		const ranked: RankedEntry<IndividualRankingEntry>[] = [
			{ ...makeIndEntry({ studentId: 's1', total: 140, competingGrade: 12, division: 1 }), rank: 1 },
			{ ...makeIndEntry({ studentId: 's2', total: 130, competingGrade: 11, division: 1 }), rank: 2 },
			{ ...makeIndEntry({ studentId: 's3', total: 125, competingGrade: 12, division: 1 }), rank: 3 },
			{ ...makeIndEntry({ studentId: 's4', total: 120, competingGrade: 12, division: 1 }), rank: 4 },
			{ ...makeIndEntry({ studentId: 's5', total: 110, competingGrade: 10, division: 1 }), rank: 5 },
			{ ...makeIndEntry({ studentId: 's6', total: 100, competingGrade: 11, division: 1 }), rank: 6 },
		];

		const result = getDistinguishedIndividualIds(ranked);
		
		expect(result.get('s4')).toBe('Distinguished Senior');
		expect(result.get('s5')).toBe('Distinguished Sophomore');
		expect(result.get('s6')).toBe('Distinguished Junior');
		
		expect(result.has('s1')).toBe(false);
		expect(result.has('s2')).toBe(false);
		expect(result.has('s3')).toBe(false);
	});

	it('returns empty if all students are in top 3', () => {
		const ranked: RankedEntry<IndividualRankingEntry>[] = [
			{ ...makeIndEntry({ studentId: 's1', total: 140, competingGrade: 12, division: 1 }), rank: 1 },
			{ ...makeIndEntry({ studentId: 's2', total: 130, competingGrade: 11, division: 1 }), rank: 2 },
			{ ...makeIndEntry({ studentId: 's3', total: 125, competingGrade: 10, division: 1 }), rank: 3 },
		];

		const result = getDistinguishedIndividualIds(ranked);
		expect(result.size).toBe(0);
	});
});
