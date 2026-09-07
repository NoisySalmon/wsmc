import { describe, expect, it } from 'vitest';
import {
	assertContestScope,
	saveResult,
	validateEntryMembership,
	type EntryMembershipValidationInput,
} from './repositories';

function valid(overrides: Partial<EntryMembershipValidationInput> = {}): EntryMembershipValidationInput {
	return {
		category: 'team_contest',
		entryKind: 'team',
		actualGrade: 10,
		competingGrade: 12,
		existingMemberGrades: [10, 11],
		existingEntryCategories: [],
		...overrides,
	};
}

describe('validateEntryMembership', () => {
	it('rejects playing down and duplicate team grades', () => {
		const errors = validateEntryMembership(valid({ competingGrade: 10 }));
		expect(errors.map((error) => error.code)).toEqual(['duplicate_competing_grade']);
		expect(validateEntryMembership(valid({ competingGrade: 9 })).map((error) => error.code)).toContain('playing_down');
	});

	it('rejects a fourth team member', () => {
		const errors = validateEntryMembership(valid({ existingMemberGrades: [9, 10, 11] }));
		expect(errors.map((error) => error.code)).toContain('team_too_large');
	});

	it('requires per-entry competing grade for teams and forbids it for individuals', () => {
		expect(validateEntryMembership(valid({ competingGrade: null })).map((error) => error.code)).toContain('competing_grade_required');
		expect(validateEntryMembership(valid({ category: 'topical_individual', entryKind: 'individual', competingGrade: 12, existingMemberGrades: [] })).map((error) => error.code)).toContain('individual_grade_forbidden');
	});

	it('enforces Topical Team/Individual exclusivity and category uniqueness', () => {
		const topicalErrors = validateEntryMembership(valid({ category: 'topical_team', existingEntryCategories: ['topical_individual'] }));
		expect(topicalErrors.map((error) => error.code)).toContain('topical_exclusivity');
		const duplicateErrors = validateEntryMembership(valid({ existingEntryCategories: ['team_contest'] }));
		expect(duplicateErrors.map((error) => error.code)).toContain('duplicate_category_entry');
	});
});

describe('assertContestScope', () => {
	it('rejects a record from another contest', () => {
		expect(() => assertContestScope({ contestId: 'contest-a' }, 'contest-b')).toThrowError(/does not belong/);
		expect(assertContestScope({ contestId: 'contest-a', id: 'entry-1' }, 'contest-a').id).toBe('entry-1');
	});
});

describe('saveResult concurrency boundary', () => {
	it('rejects an existing-result update without an expected version', async () => {
		const rows = [
			[{ id: 'entry-1', contestId: 'contest-1' }],
			[{ id: 'result-1', entryId: 'entry-1', version: 4 }],
		];
		const db = { select: () => ({ from: () => ({ where: async () => rows.shift() ?? [] }) }) };
		await expect(saveResult(db as never, { contestId: 'contest-1', entryId: 'entry-1', score: 99 })).rejects.toMatchObject({ code: 'version_required' });
	});
});
