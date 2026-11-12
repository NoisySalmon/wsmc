import { describe, expect, it } from 'vitest';
import { buildRegionalPlacementDecisions } from './rules';
import type { RegionalRankedResult, RegionalRankings } from '$lib/server/scoring/rankings';

function entry(id: string, category: RegionalRankedResult['category'], rank: number, extra: Partial<RegionalRankedResult> = {}): RegionalRankedResult {
	return { entryId: id, category, division: 1, entryNumber: null, schoolName: 'School', studentId: category === 'topical_individual' || category === 'knowdown' ? id : null, score: 100, part1: category.startsWith('topical') ? 50 : null, part2: category.startsWith('topical') ? 50 : null, placement: category === 'knowdown' ? rank : null, studentName: category === 'topical_individual' || category === 'knowdown' ? id : null, actualGrade: category === 'topical_individual' ? 12 : null, rank, ...extra };
}

function rankings(overrides: Partial<RegionalRankings> = {}): RegionalRankings {
	return { project: [], team_contest: [], topical_team: [], topical_individual: [], knowdown: [], ...overrides };
}

describe('regional qualification decisions', () => {
	it('qualifies every tied rank through third and leaves the fourth Knowdown active flag off', () => {
		const decisions = buildRegionalPlacementDecisions(rankings({ project: [entry('a', 'project', 1), entry('b', 'project', 2), entry('c', 'project', 2), entry('d', 'project', 4)], knowdown: [entry('k1', 'knowdown', 1), entry('k4', 'knowdown', 4)] }));
		expect(decisions.filter((decision) => decision.entryId !== 'k4').map((decision) => decision.entryId)).toEqual(['a', 'b', 'c', 'k1']);
		expect(decisions.find((decision) => decision.entryId === 'k4')).toMatchObject({ kind: 'knowdown_alternate', active: false, rank: 4 });
	});

	it.each(['team_contest', 'topical_team'] as const)('automatically qualifies only first place, including ties in either division, for %s', category => {
		const decisions = buildRegionalPlacementDecisions(rankings({ [category]: [
			entry('d1-first-a', category, 1), entry('d1-first-b', category, 1),
			entry('d1-third', category, 3),
			entry('d2-first', category, 1, { division: 2 }), entry('d2-second', category, 2, { division: 2 }),
		] }));
		expect(decisions.map(decision => decision.entryId)).toEqual(['d1-first-a', 'd1-first-b', 'd2-first']);
	});

	it('selects overall winners first, then distinguished students from the remaining pool with one basis each', () => {
		const decisions = buildRegionalPlacementDecisions(rankings({ topical_individual: [
			entry('first', 'topical_individual', 1, { score: 100, actualGradeRank: 1 }),
			entry('second', 'topical_individual', 2, { score: 90, actualGradeRank: 2 }),
			entry('third', 'topical_individual', 3, { score: 80, actualGradeRank: 3 }),
			entry('distinguished-senior', 'topical_individual', 4, { division: 2, score: 70, actualGradeRank: 4 }),
			entry('next-senior', 'topical_individual', 5, { score: 60, actualGradeRank: 5 }),
			entry('distinguished-junior', 'topical_individual', 6, { score: 40, actualGrade: 11, actualGradeRank: 1 }),
			entry('next-junior', 'topical_individual', 7, { score: 30, actualGrade: 11, actualGradeRank: 2 }),
			entry('distinguished-sophomore', 'topical_individual', 8, { score: 20, actualGrade: 10, actualGradeRank: 1 }),
			entry('freshman-a', 'topical_individual', 9, { score: 10, actualGrade: 9, actualGradeRank: 1 }),
			entry('freshman-b', 'topical_individual', 9, { division: 2, score: 10, actualGrade: 9, actualGradeRank: 1 }),
			entry('next-freshman', 'topical_individual', 11, { score: 5, actualGrade: 9, actualGradeRank: 3 }),
		] }));
		expect(decisions.map(({ entryId, scope, rank, actualGrade }) => [entryId, scope, rank, actualGrade])).toEqual([
			['first', 'overall', 1, null], ['second', 'overall', 2, null], ['third', 'overall', 3, null],
			['distinguished-senior', 'actual_grade', 1, 12], ['distinguished-junior', 'actual_grade', 1, 11],
			['distinguished-sophomore', 'actual_grade', 1, 10], ['freshman-a', 'actual_grade', 1, 9], ['freshman-b', 'actual_grade', 1, 9],
		]);
	});

	it('removes all tied overall qualifiers before choosing a distinguished student and skips empty grades', () => {
		const decisions = buildRegionalPlacementDecisions(rankings({ topical_individual: [
			entry('first', 'topical_individual', 1, { score: 100 }),
			entry('second', 'topical_individual', 2, { score: 90 }),
			entry('third-a', 'topical_individual', 3, { score: 80, actualGrade: 11 }),
			entry('third-b', 'topical_individual', 3, { score: 80, actualGrade: 11 }),
			entry('distinguished', 'topical_individual', 5, { score: 50, actualGrade: 11 }),
		] }));
		expect(decisions.map(({ entryId, scope }) => [entryId, scope])).toEqual([
			['first', 'overall'], ['second', 'overall'], ['third-a', 'overall'], ['third-b', 'overall'], ['distinguished', 'actual_grade'],
		]);
	});
});
