import { describe, expect, it } from 'vitest';
import { rankRegionalResults, type RegionalResultRow } from './rankings';

function row(overrides: Partial<RegionalResultRow> = {}): RegionalResultRow {
	return { entryId: crypto.randomUUID(), category: 'project', division: 1, entryNumber: null, schoolName: 'School', studentId: null, score: 0, part1: null, part2: null, placement: null, studentName: null, actualGrade: null, ...overrides };
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
			row({ entryId: 'entry-senior', studentId: 'senior', category: 'topical_individual', score: 140, part1: 70, part2: 70, studentName: 'Senior', actualGrade: 12 }),
			row({ entryId: 'entry-junior', studentId: 'junior', category: 'topical_individual', score: 130, part1: 65, part2: 65, studentName: 'Junior', actualGrade: 11 }),
			row({ entryId: 'entry-other-senior', studentId: 'other-senior', category: 'topical_individual', score: 120, part1: 60, part2: 60, studentName: 'Other Senior', actualGrade: 12 }),
		]);
		expect(result.topical_individual.map((entry) => [entry.studentId, entry.rank, entry.actualGradeRank])).toEqual([['senior', 1, 1], ['junior', 2, 1], ['other-senior', 3, 2]]);
	});

	it('ranks four unique Knowdown places and excludes eliminated entrants', () => {
		const result = rankRegionalResults([
			row({ entryId: 'kd-1', category: 'knowdown', placement: 1, score: null, studentId: 's1', studentName: 'One' }),
			row({ entryId: 'kd-2', category: 'knowdown', placement: 2, score: null, studentId: 's2', studentName: 'Two' }),
			row({ entryId: 'kd-3', category: 'knowdown', placement: 3, score: null, studentId: 's3', studentName: 'Three' }),
			row({ entryId: 'kd-4', category: 'knowdown', placement: 4, score: null, studentId: 's4', studentName: 'Four' }),
			row({ entryId: 'kd-eliminated-a', category: 'knowdown', placement: null, score: null, studentId: 's5', studentName: 'Five' }),
			row({ entryId: 'kd-eliminated-b', category: 'knowdown', placement: null, score: null, studentId: 's6', studentName: 'Six' }),
		]);
		expect(result.knowdown.map((entry) => [entry.placement, entry.rank])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
	});
});
