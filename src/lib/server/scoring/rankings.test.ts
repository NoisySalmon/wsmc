import { describe, expect, it } from 'vitest';
import { rankRegionalResults, type RegionalResultRow } from './rankings';

function row(overrides: Partial<RegionalResultRow> = {}): RegionalResultRow {
	return { entryId: crypto.randomUUID(), category: 'project', division: 1, entryNumber: null, schoolName: 'School', score: 0, part1: null, part2: null, placement: null, studentName: null, actualGrade: null, ...overrides };
}

describe('regional rankings', () => {
	it('uses competition rank for category ties within each division', () => {
		const result = rankRegionalResults([
			row({ entryId: 'a', score: 100 }), row({ entryId: 'b', score: 90 }), row({ entryId: 'c', score: 90 }), row({ entryId: 'd', score: 80 }), row({ entryId: 'e', division: 2, score: 95 }),
		]);
		expect(result.project.map((entry) => entry.rank)).toEqual([1, 2, 2, 4, 1]);
		expect(result.project.filter((entry) => entry.division === 2).map((entry) => entry.rank)).toEqual([1]);
	});

	it('provides overall and actual-grade Topical Individual placement', () => {
		const result = rankRegionalResults([
			row({ entryId: 'senior', category: 'topical_individual', score: 140, part1: 70, part2: 70, studentName: 'Senior', actualGrade: 12 }),
			row({ entryId: 'junior', category: 'topical_individual', score: 130, part1: 65, part2: 65, studentName: 'Junior', actualGrade: 11 }),
			row({ entryId: 'other-senior', category: 'topical_individual', score: 120, part1: 60, part2: 60, studentName: 'Other Senior', actualGrade: 12 }),
		]);
		expect(result.topical_individual.map((entry) => [entry.entryId, entry.rank, entry.actualGradeRank])).toEqual([['senior', 1, 1], ['junior', 2, 1], ['other-senior', 3, 2]]);
	});
});
