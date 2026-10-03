import { describe, expect, it } from 'vitest';
import { rankRegionalResults, type RegionalResultRow } from '$lib/server/scoring/rankings';
import { buildRegionalPlacementDecisions } from '$lib/server/qualification/rules';

function result(overrides: Partial<RegionalResultRow>): RegionalResultRow {
	return {
		entryId: 'entry', category: 'team_contest', division: 1, entryNumber: 1, schoolName: 'School',
		studentId: null, score: 0, part1: null, part2: null, placement: null, studentName: null, actualGrade: null,
		...overrides,
	};
}

describe('ranking-to-qualification contract', () => {
	it('preserves the explainable qualification decision handoff', () => {
		const rankings = rankRegionalResults([
			result({ entryId: 'team-first', category: 'team_contest', score: 100 }),
			result({ entryId: 'team-second', category: 'team_contest', score: 90 }),
		]);
		const decisions = buildRegionalPlacementDecisions(rankings);
		expect(decisions.map((decision) => [decision.entryId, decision.kind, decision.rank])).toEqual([
			['team-first', 'regional_placement', 1], ['team-second', 'regional_placement', 2],
		]);
	});
});
