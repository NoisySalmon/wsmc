import { describe, it, expect } from 'vitest';
import {
	rankByScore,
	rankIndividuals,
	computeDistinguished,
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

describe('computeDistinguished', () => {
	it('picks top individual not on a top-3 topical team', () => {
		const individuals: IndividualRankingEntry[] = [
			makeIndEntry({ studentId: 's1', name: 'Alice', total: 130, division: 1, competingGrade: 12, schoolName: 'A' }),
			makeIndEntry({ studentId: 's2', name: 'Bob', total: 120, division: 1, competingGrade: 12, schoolName: 'B' }),
		];

		// s1 is on a top-3 topical team
		const top3 = new Set(['s1']);
		const result = computeDistinguished(individuals, top3);
		const div1gr12 = result.find((r) => r.division === 1 && r.competingGrade === 12);
		expect(div1gr12).toBeDefined();
		expect(div1gr12!.studentName).toBe('Bob');
	});

	it('returns empty for a grade/division with no eligible students', () => {
		const individuals: IndividualRankingEntry[] = [
			makeIndEntry({ studentId: 's1', name: 'Alice', total: 130, division: 1, competingGrade: 12 }),
		];
		const top3 = new Set(['s1']);
		const result = computeDistinguished(individuals, top3);
		const div1gr12 = result.find((r) => r.division === 1 && r.competingGrade === 12);
		expect(div1gr12).toBeUndefined();
	});

	it('computes across multiple grades and divisions', () => {
		const individuals: IndividualRankingEntry[] = [
			makeIndEntry({ studentId: 's1', name: 'A', total: 130, division: 1, competingGrade: 12 }),
			makeIndEntry({ studentId: 's2', name: 'B', total: 100, division: 1, competingGrade: 9 }),
			makeIndEntry({ studentId: 's3', name: 'C', total: 90, division: 2, competingGrade: 9 }),
		];
		const result = computeDistinguished(individuals, new Set());
		expect(result.length).toBe(3);
		expect(result.find((r) => r.division === 1 && r.competingGrade === 12)?.studentName).toBe('A');
		expect(result.find((r) => r.division === 1 && r.competingGrade === 9)?.studentName).toBe('B');
		expect(result.find((r) => r.division === 2 && r.competingGrade === 9)?.studentName).toBe('C');
	});
});
