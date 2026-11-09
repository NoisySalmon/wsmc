import { describe, expect, it } from 'vitest';
import { previewStateCutoffs, type CutoffThresholds } from './cutoffs';
import type { RegionalResultRow } from '$lib/server/scoring/rankings';

const thresholds: CutoffThresholds = { project: { 1: null, 2: null }, team_contest: { 1: 80, 2: 90 }, topical_team: { 1: 100, 2: 100 }, topical_individual: { 1: 120, 2: 120 } };
function row(overrides: Partial<RegionalResultRow>): RegionalResultRow { return { entryId: 'entry', category: 'team_contest', division: 1, entryNumber: 1, schoolName: 'School', studentId: null, score: 80, part1: null, part2: null, placement: null, studentName: null, actualGrade: null, ...overrides }; }

describe('state cutoff preview', () => {
	it('uses division-specific thresholds and excludes Knowdown', () => {
		const result = previewStateCutoffs([row({ entryId: 'd1', score: 80 }), row({ entryId: 'd2', division: 2, score: 89 }), row({ entryId: 'knowdown', category: 'knowdown', score: 999 })], thresholds, new Set());
		expect(result.map((entry) => entry.entryId)).toEqual(['d1']);
	});

	it('marks placement-qualified entries as existing and proposes only additions', () => {
		const result = previewStateCutoffs([row({ entryId: 'existing', score: 100 }), row({ entryId: 'new', score: 95 })], thresholds, new Set(['existing']));
		expect(result.map((entry) => [entry.entryId, entry.alreadyQualified, entry.added])).toEqual([['existing', true, false], ['new', false, true]]);
	});
	it('supports zero-score Project cutoffs, higher cutoffs, and disabling additions without duplicating placements', () => {
		const projects = [
			row({ entryId: 'placement', category: 'project', score: 0 }),
			row({ entryId: 'additional', category: 'project', score: 20 }),
			row({ entryId: 'd2', category: 'project', division: 2, score: 0 }),
			row({ entryId: 'unscored', category: 'project', score: null }),
		];
		const reference = { ...thresholds, project: { 1: 0, 2: 0 } };
		expect(previewStateCutoffs(projects, reference, new Set(['placement'])).map(row => [row.entryId, row.added])).toEqual([
			['additional', true], ['placement', false], ['d2', true],
		]);
		expect(previewStateCutoffs(projects, { ...reference, project: { 1: 20, 2: null } }, new Set(['placement'])).map(row => row.entryId)).toEqual(['additional']);
		expect(previewStateCutoffs(projects, { ...reference, project: { 1: null, 2: null } }, new Set(['placement']))).toEqual([]);
	});

});
