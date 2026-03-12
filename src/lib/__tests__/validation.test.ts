import { describe, it, expect } from 'vitest';
import {
	validatePlayUp,
	validateGrade,
	validateKnowdownCount,
	validateTeamSize,
	validateTeamGrades,
	validateTopicalExclusivity,
	validateTeamAssignment,
	type StudentData,
	type TeamData,
} from '../validation';

function makeStudent(overrides: Partial<StudentData> = {}): StudentData {
	return {
		id: 'stu-1',
		name: 'Test Student',
		actualGrade: 10,
		competingGrade: 10,
		isKnowdown: false,
		...overrides,
	};
}

function makeTeam(overrides: Partial<TeamData> = {}): TeamData {
	return {
		id: 'team-1',
		contestType: 'project',
		teamNumber: 1,
		members: [],
		...overrides,
	};
}

describe('validatePlayUp', () => {
	it('allows same grade', () => {
		expect(validatePlayUp(10, 10)).toBeNull();
	});
	it('allows playing up', () => {
		expect(validatePlayUp(9, 11)).toBeNull();
	});
	it('rejects playing down', () => {
		expect(validatePlayUp(11, 10)).not.toBeNull();
	});
});

describe('validateGrade', () => {
	it('accepts 9-12', () => {
		for (const g of [9, 10, 11, 12]) {
			expect(validateGrade(g)).toBeNull();
		}
	});
	it('rejects other values', () => {
		expect(validateGrade(8)).not.toBeNull();
		expect(validateGrade(13)).not.toBeNull();
		expect(validateGrade(0)).not.toBeNull();
	});
});

describe('validateKnowdownCount', () => {
	it('allows up to 3', () => {
		const students = [
			makeStudent({ id: '1', isKnowdown: true }),
			makeStudent({ id: '2', isKnowdown: true }),
			makeStudent({ id: '3', isKnowdown: false }),
		];
		expect(validateKnowdownCount(students, '3')).toBeNull();
	});
	it('rejects 4th knowdown', () => {
		const students = [
			makeStudent({ id: '1', isKnowdown: true }),
			makeStudent({ id: '2', isKnowdown: true }),
			makeStudent({ id: '3', isKnowdown: true }),
			makeStudent({ id: '4', isKnowdown: false }),
		];
		expect(validateKnowdownCount(students, '4')).not.toBeNull();
	});
});

describe('validateTeamSize', () => {
	it('allows 1-3', () => {
		expect(validateTeamSize(1)).toBeNull();
		expect(validateTeamSize(2)).toBeNull();
		expect(validateTeamSize(3)).toBeNull();
	});
	it('rejects 4+', () => {
		expect(validateTeamSize(4)).not.toBeNull();
	});
});

describe('validateTeamGrades', () => {
	it('allows different grades', () => {
		expect(validateTeamGrades([9, 10, 11])).toBeNull();
	});
	it('rejects duplicate grades', () => {
		expect(validateTeamGrades([10, 10, 11])).not.toBeNull();
	});
});

describe('validateTopicalExclusivity', () => {
	it('returns null if not on topical team', () => {
		const teams = [makeTeam({ contestType: 'project', members: [{ studentId: 'stu-1', competingGrade: 10 }] })];
		expect(validateTopicalExclusivity('stu-1', teams)).toBeNull();
	});
	it('returns error if on topical team', () => {
		const teams = [makeTeam({ contestType: 'topical', members: [{ studentId: 'stu-1', competingGrade: 10 }] })];
		expect(validateTopicalExclusivity('stu-1', teams)).not.toBeNull();
	});
});

describe('validateTeamAssignment', () => {
	it('allows valid assignment', () => {
		const student = makeStudent({ competingGrade: 12 });
		const team = makeTeam({
			members: [
				{ studentId: 'other-1', competingGrade: 10 },
				{ studentId: 'other-2', competingGrade: 11 },
			],
		});
		expect(validateTeamAssignment(student, team, [team])).toEqual([]);
	});

	it('rejects 4th member', () => {
		const student = makeStudent({ competingGrade: 9 });
		const team = makeTeam({
			members: [
				{ studentId: 'a', competingGrade: 10 },
				{ studentId: 'b', competingGrade: 11 },
				{ studentId: 'c', competingGrade: 12 },
			],
		});
		const errors = validateTeamAssignment(student, team, [team]);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors.some((e) => e.includes('at most 3'))).toBe(true);
	});

	it('rejects duplicate competing grade', () => {
		const student = makeStudent({ competingGrade: 10 });
		const team = makeTeam({
			members: [{ studentId: 'other', competingGrade: 10 }],
		});
		const errors = validateTeamAssignment(student, team, [team]);
		expect(errors.some((e) => e.includes('different competing grade'))).toBe(true);
	});

	it('rejects student already on another team of same type', () => {
		const student = makeStudent({ id: 'stu-1', competingGrade: 10 });
		const existingTeam = makeTeam({
			id: 'team-existing',
			members: [{ studentId: 'stu-1', competingGrade: 10 }],
		});
		const newTeam = makeTeam({ id: 'team-new', members: [] });
		const errors = validateTeamAssignment(student, newTeam, [existingTeam, newTeam]);
		expect(errors.some((e) => e.includes('already on a'))).toBe(true);
	});
});
