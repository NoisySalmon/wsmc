import { describe, expect, it } from 'vitest';
import { toPublicStateResult } from './public';

describe('public state result projection', () => {
	it('uses an explicit safe field allowlist', () => {
		const row = toPublicStateResult('team_contest', {
			entryId: 'internal-entry', studentId: 'internal-student', category: 'team_contest', division: 1,
			entryNumber: 4, schoolName: 'Alpha', studentName: null, actualGrade: null, score: 91,
			part1: null, part2: null, placement: null, rank: 1,
		} as never);
		expect(row).toEqual({ category: 'team_contest', division: 1, rank: 1, actualGrade: null, actualGradeRank: null, entryNumber: 4, schoolName: 'Alpha', studentName: null, score: 91, part1: null, part2: null, placement: null });
		expect(row).not.toHaveProperty('entryId');
		expect(row).not.toHaveProperty('studentId');
	});
});
