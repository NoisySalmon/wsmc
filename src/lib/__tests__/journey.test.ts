import { describe, expect, it } from 'vitest';
import { canFinalizeContest, canScoreContest, type Principal } from '$lib/server/auth/capabilities';
import { computeRegionalPlacementReasons, computeStateCutoffReasons, stateEligibleStudentIds } from '$lib/qualifications';
import { rankRegionalResults, type RegionalResultRow } from '$lib/server/scoring/rankings';
import { buildRegionalPlacementDecisions } from '$lib/server/qualification/rules';

function result(overrides: Partial<RegionalResultRow>): RegionalResultRow {
	return {
		entryId: 'entry', category: 'team_contest', division: 1, entryNumber: 1, schoolName: 'School',
		studentId: null, score: 0, part1: null, part2: null, placement: null, studentName: null, actualGrade: null,
		...overrides,
	};
}

const overlappingPrincipal: Principal = {
	id: 'coordinator-coach', email: 'coordinator@example.com', displayName: 'Coordinator Coach',
	statewideSeasonIds: ['season-2026'], regionalContestIds: ['regional-1'],
	coachAssignments: [{ seasonId: 'season-2026', schoolId: 'school-alpha' }, { seasonId: 'season-2026', schoolId: 'school-beta' }],
	scorekeeperContestIds: ['regional-2'],
};

describe('regional-to-state journey contract', () => {
	it('carries qualified regional outcomes into state eligibility and ranking', () => {
		const regionalEntries = [
			{ entryId: 'regional-team-alpha', category: 'team_contest' as const, division: 1, score: 88, studentIds: ['student-alpha-1', 'student-alpha-2'] },
			{ entryId: 'regional-topical-alpha', category: 'topical_individual' as const, division: 1, score: 140, actualGrade: 12, studentIds: ['student-alpha-1'] },
			{ entryId: 'regional-topical-beta', category: 'topical_individual' as const, division: 1, score: 130, actualGrade: 12, studentIds: ['student-beta-1'] },
		];
		const placementReasons = computeRegionalPlacementReasons(regionalEntries);
		const cutoffReasons = computeStateCutoffReasons(regionalEntries, { team_contest: 88, topical_individual: 130 });
		const eligible = stateEligibleStudentIds([...placementReasons, ...cutoffReasons]);

		expect(eligible).toEqual(new Set(['student-alpha-1', 'student-alpha-2', 'student-beta-1']));
		expect(placementReasons.filter((reason) => reason.entryId === 'regional-topical-alpha')).toHaveLength(2);
		const stateRows = rankRegionalResults([
			result({ entryId: 'state-team-alpha', schoolName: 'Alpha / Gamma', score: 91 }),
			result({ entryId: 'state-team-beta', division: 2, schoolName: 'Beta', score: 86 }),
		]);
		expect(stateRows.team_contest.map((row) => [row.entryId, row.rank])).toEqual([['state-team-alpha', 1], ['state-team-beta', 1]]);
	});

	it('keeps scorekeeper access separate from finalization authority across assignments', () => {
		expect(canScoreContest(overlappingPrincipal, 'regional-1', 'season-2026')).toBe(true);
		expect(canScoreContest(overlappingPrincipal, 'regional-2', 'season-2026')).toBe(true);
		expect(canFinalizeContest(overlappingPrincipal, 'regional-1', 'season-2026')).toBe(true);
		const scorekeeper: Principal = { ...overlappingPrincipal, statewideSeasonIds: [], regionalContestIds: [], coachAssignments: [], scorekeeperContestIds: ['regional-2'] };
		expect(canScoreContest(scorekeeper, 'regional-2', 'season-2026')).toBe(true);
		expect(canFinalizeContest(scorekeeper, 'regional-2', 'season-2026')).toBe(false);
	});

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
