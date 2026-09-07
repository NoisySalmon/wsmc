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

	it('preserves both overall and actual-grade reasons for one Topical Individual', () => {
		const decisions = buildRegionalPlacementDecisions(rankings({ topical_individual: [entry('student-1', 'topical_individual', 1, { actualGradeRank: 1 })] }));
		expect(decisions.filter((decision) => decision.entryId === 'student-1').map((decision) => decision.scope)).toEqual(['overall', 'actual_grade']);
	});
});
