import { describe, expect, it } from 'vitest';
import { readCutoffThresholds, summarizePlan, type PlanningData, type CutoffThresholds } from './qualification';

// A student may occupy multiple team slots and qualify individually as well.
// Population targets count annual student identities, never those slots.
const planning: PlanningData = {
	finalized: 1, total: 2, automaticEntryIds: ['automatic'],
	rows: [
		{ entryId: 'automatic', category: 'team_contest', division: 1, score: 5 },
		{ entryId: 'team', category: 'team_contest', division: 1, score: 10 },
		{ entryId: 'individual', category: 'topical_individual', division: 2, score: 50 },
		{ entryId: 'missing', category: 'topical_team', division: 1, score: null },
	].map(row => ({ entryNumber: 1, schoolName: 'School', studentId: null, studentName: null, actualGrade: null, part1: null, part2: null, placement: null, ...row })) as PlanningData['rows'],
	members: [
		{ entryId: 'automatic', studentId: 'shared' },
		{ entryId: 'team', studentId: 'shared' },
		{ entryId: 'team', studentId: 'new' },
		{ entryId: 'individual', studentId: 'new' },
		{ entryId: 'missing', studentId: 'unknown-score' },
	],
};
const thresholds: CutoffThresholds = { project: null, team_contest: { 1: 10, 2: null }, topical_team: { 1: 0, 2: null }, topical_individual: 50 };

describe('qualification population planning', () => {
	it('deduplicates students across automatic, team and individual invitations while preserving event counts', () => {
		expect(summarizePlan(planning, thresholds)).toMatchObject({ automaticStudents: 1, automaticEntries: 1, addedStudents: 1, students: 2, eligibleEntries: 3,
			eventSummaries: {
				'team_contest:1': { automaticEntries: 1, cutoffEntries: 1, totalEntries: 2, automaticStudents: 1, cutoffStudents: 2, students: 2 },
				'topical_individual:all': { automaticEntries: 0, cutoffEntries: 1, totalEntries: 1, automaticStudents: 0, cutoffStudents: 1, students: 1 },
				'team_contest:2': { automaticEntries: 0, cutoffEntries: 0, totalEntries: 0, automaticStudents: 0, cutoffStudents: 0, students: 0 },
			},
		});
	});

	it('recomputes a stricter scenario without losing automatic eligibility or retaining former additions', () => {
		summarizePlan(planning, thresholds);
		const strict = { ...thresholds, team_contest: { 1: null, 2: null }, topical_individual: 51 };
		expect(summarizePlan(planning, strict)).toMatchObject({ students: 1, eligibleEntries: 1, addedStudents: 0, additions: [],
			eventSummaries: { 'team_contest:1': { automaticEntries: 1, cutoffEntries: 0, totalEntries: 1, automaticStudents: 1, cutoffStudents: 0, students: 1 } },
		});
	});
});

describe('saved cutoff compatibility', () => {
	it('combines equal legacy cutoffs and flags conflicting values for an explicit choice', () => {
		const legacy = { ...thresholds, project: { 1: 0, 2: 0 }, topical_individual: { 1: 50, 2: 50 } };
		expect(readCutoffThresholds(JSON.stringify(legacy))).toEqual({ thresholds: { ...thresholds, project: 0 }, needsReview: false });
		expect(readCutoffThresholds(JSON.stringify({ ...legacy, topical_individual: { 1: 50, 2: 60 } }))).toMatchObject({ thresholds: { topical_individual: null }, needsReview: true });
	});
});
