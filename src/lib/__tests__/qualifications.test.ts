import { describe, expect, it } from 'vitest';
import {
	computeRegionalPlacementReasons,
	computeStateCutoffReasons,
	mergeQualificationReasons,
	stateEligibleStudentIds,
	type QualificationEntry,
} from '../qualifications';

function individual(overrides: Partial<QualificationEntry> & { entryId: string; studentId: string; score: number; division: number; actualGrade: number }): QualificationEntry {
	return {
		category: 'topical_individual',
		studentIds: [overrides.studentId],
		...overrides,
	};
}

describe('computeRegionalPlacementReasons', () => {
	it('qualifies every team tied at the rank-3 boundary', () => {
		const entries: QualificationEntry[] = [
			{ entryId: 'a', category: 'team_contest', division: 1, score: 100, studentIds: ['a1'] },
			{ entryId: 'b', category: 'team_contest', division: 1, score: 90, studentIds: ['b1'] },
			{ entryId: 'c', category: 'team_contest', division: 1, score: 80, studentIds: ['c1'] },
			{ entryId: 'd', category: 'team_contest', division: 1, score: 80, studentIds: ['d1'] },
		];

		const reasons = computeRegionalPlacementReasons(entries);
		expect(reasons.filter((reason) => reason.entryId === 'c' || reason.entryId === 'd').map((reason) => reason.rank)).toEqual([3, 3]);
	});

	it('keeps overall and actual-grade topical individual reasons', () => {
		const entries = [
			individual({ entryId: 's1', studentId: 's1', score: 100, division: 1, actualGrade: 12 }),
			individual({ entryId: 's2', studentId: 's2', score: 90, division: 1, actualGrade: 11 }),
			individual({ entryId: 's3', studentId: 's3', score: 80, division: 1, actualGrade: 12 }),
			individual({ entryId: 's4', studentId: 's4', score: 70, division: 1, actualGrade: 9 }),
		];

		const reasons = computeRegionalPlacementReasons(entries);
		const s1Reasons = reasons.filter((reason) => reason.entryId === 's1');
		expect(s1Reasons.map((reason) => reason.scope).sort()).toEqual(['actual_grade', 'overall']);
		expect(reasons.some((reason) => reason.entryId === 's4' && reason.scope === 'actual_grade' && reason.actualGrade === 9)).toBe(true);
	});

	it('uses one Knowdown bracket and records fourth place as an inactive alternate', () => {
		const entries: QualificationEntry[] = [1, 2, 3, 4].map((place) => ({
			entryId: `k${place}`,
			category: 'knowdown',
			division: place % 2,
			place,
			studentIds: [`student-${place}`],
		}));
		const reasons = computeRegionalPlacementReasons(entries);
		expect(reasons.filter((reason) => reason.kind === 'regional_placement')).toHaveLength(3);
		expect(reasons.find((reason) => reason.entryId === 'k4')?.kind).toBe('knowdown_alternate');
	});
});

describe('qualification reason composition', () => {
	it('deduplicates repeated reasons but preserves distinct reasons', () => {
		const placement = computeRegionalPlacementReasons([
			{ entryId: 'team-1', category: 'team_contest', division: 1, score: 100, studentIds: ['student-1', 'student-2'] },
		]);
		const cutoff = computeStateCutoffReasons(
			[{ entryId: 'team-1', category: 'team_contest', division: 1, score: 100, studentIds: ['student-1', 'student-2'] }],
			{ team_contest: 90 },
		);
		const merged = mergeQualificationReasons(placement, placement, cutoff);
		expect(merged).toHaveLength(2);
		expect(stateEligibleStudentIds(merged)).toEqual(new Set(['student-1', 'student-2']));
	});

	it('unions a placement qualifier with a later cutoff qualifier', () => {
		const placement = computeRegionalPlacementReasons([
			{ entryId: 'placed', category: 'team_contest', division: 1, score: 50, studentIds: ['p1'] },
			{ entryId: 'other', category: 'team_contest', division: 1, score: 40, studentIds: ['o1'] },
			{ entryId: 'third', category: 'team_contest', division: 1, score: 30, studentIds: ['t1'] },
		]);
		const cutoff = computeStateCutoffReasons(
			[
				{ entryId: 'placed', category: 'team_contest', division: 1, score: 50, studentIds: ['p1'] },
				{ entryId: 'other', category: 'team_contest', division: 1, score: 40, studentIds: ['o1'] },
			],
			{ team_contest: 45 },
		);
		const merged = mergeQualificationReasons(placement, cutoff);
		expect(new Set(merged.map((reason) => reason.entryId))).toEqual(new Set(['placed', 'other', 'third']));
		expect(merged.filter((reason) => reason.entryId === 'placed')).toHaveLength(2);
	});
});
