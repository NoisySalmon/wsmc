import { describe, expect, it } from 'vitest';
import { previewStateCutoffs, type CutoffThresholds } from './cutoffs';
import type { RegionalResultRow } from '$lib/server/scoring/rankings';

const thresholds: CutoffThresholds = { team_contest: { 1: 80, 2: 90 }, topical_team: { 1: 100, 2: 100 }, topical_individual: { 1: 120, 2: 120 } };
function row(overrides: Partial<RegionalResultRow>): RegionalResultRow { return { entryId: 'entry', category: 'team_contest', division: 1, entryNumber: 1, schoolName: 'School', studentId: null, score: 80, part1: null, part2: null, placement: null, studentName: null, actualGrade: null, ...overrides }; }

describe('state cutoff preview', () => {
	it('uses division-specific thresholds and excludes placement-only categories', () => {
		const result = previewStateCutoffs([row({ entryId: 'd1', score: 80 }), row({ entryId: 'd2', division: 2, score: 89 }), row({ entryId: 'project', category: 'project', score: 999 })], thresholds, new Set());
		expect(result.map((entry) => entry.entryId)).toEqual(['d1']);
	});

	it('marks placement-qualified entries as existing and proposes only additions', () => {
		const result = previewStateCutoffs([row({ entryId: 'existing', score: 100 }), row({ entryId: 'new', score: 95 })], thresholds, new Set(['existing']));
		expect(result.map((entry) => [entry.entryId, entry.alreadyQualified, entry.added])).toEqual([['existing', true, false], ['new', false, true]]);
	});
});
