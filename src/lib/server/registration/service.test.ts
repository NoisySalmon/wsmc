import { describe, expect, it } from 'vitest';
import { RegistrationError, addRosterStudent, createAnnualStudent, createCategoryEntry, planTopicalAssignments, reopenRoster, resolveTeamGroups } from './service';

describe('registration workflow rules', () => {
	it('validates annual student input before database access', async () => {
		await expect(createAnnualStudent({} as never, { seasonId: 'season-1', schoolId: 'school-1', name: '', actualGrade: 10 })).rejects.toMatchObject({ code: 'invalid_name' });
		await expect(createAnnualStudent({} as never, { seasonId: 'season-1', schoolId: 'school-1', name: 'Student', actualGrade: 8 })).rejects.toMatchObject({ code: 'invalid_grade' });
	});

	it('rejects roster changes unless registration is open', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [{ kind: 'regional', lifecycle: 'roster_locked' }] }) }) };
		await expect(addRosterStudent(db as never, { contestId: 'contest-1', schoolId: 'school-1', studentId: 'student-1' })).rejects.toMatchObject({ code: 'locked' });
	});

	it('requires a reason and locked state for coordinator reopen', async () => {
		const noReasonDb = { select: () => ({ from: () => ({ where: async () => [] }) }) };
		await expect(reopenRoster(noReasonDb as never, { contestId: 'contest-1', actorUserId: 'user-1', reason: ' ' })).rejects.toMatchObject({ code: 'reason_required' });
		const db = { select: () => ({ from: () => ({ where: async () => [{ kind: 'regional', lifecycle: 'registration_open' }] }) }) };
		await expect(reopenRoster(db as never, { contestId: 'contest-1', actorUserId: 'user-1', reason: 'Correct roster' })).rejects.toMatchObject({ code: 'invalid_transition' });
	});

	it('requires a participating contest before creating a category entry', async () => {
		const db = { select: () => ({ from: () => ({ where: async () => [] }) }) };
		await expect(createCategoryEntry(db as never, { contestId: 'contest-1', schoolId: 'school-1', category: 'project' })).rejects.toMatchObject({ code: 'not_found' });
	});

	it('groups matrix team assignments with default actual grades', () => {
		const students = new Map([['a', 10], ['b', 11], ['c', 12]]);
		const teams = resolveTeamGroups(students, [
			{ studentId: 'a', team: 1, competingGrade: null },
			{ studentId: 'b', team: 1, competingGrade: 12 },
			{ studentId: 'c', team: null },
		]);
		expect(teams.get(1)).toEqual([{ studentId: 'a', competingGrade: 10 }, { studentId: 'b', competingGrade: 12 }]);
		expect(teams.has(2)).toBe(false);
	});

	it('rejects invalid matrix team groups', () => {
		const students = new Map([['a', 10], ['b', 9], ['c', 9], ['d', 9]]);
		expect(() => resolveTeamGroups(students, [{ studentId: 'b', team: 1 }, { studentId: 'c', team: 1 }])).toThrowError(expect.objectContaining({ code: 'duplicate_competing_grade' }));
		expect(() => resolveTeamGroups(students, [{ studentId: 'a', team: 1, competingGrade: 9 }])).toThrowError(expect.objectContaining({ code: 'playing_down' }));
		expect(() => resolveTeamGroups(students, [
			{ studentId: 'a', team: 1, competingGrade: 10 }, { studentId: 'b', team: 1, competingGrade: 9 },
			{ studentId: 'c', team: 1, competingGrade: 11 }, { studentId: 'd', team: 1, competingGrade: 12 },
		])).toThrowError(expect.objectContaining({ code: 'team_too_large' }));
		expect(() => resolveTeamGroups(students, [{ studentId: 'ghost', team: 1 }])).toThrowError(expect.objectContaining({ code: 'student_not_found' }));
		expect(() => resolveTeamGroups(students, [{ studentId: 'a', team: 0 }])).toThrowError(expect.objectContaining({ code: 'invalid_team' }));
	});

	it('splits topical matrix assignments into teams and individuals', () => {
		const students = new Map([['a', 10], ['b', 11], ['c', 12]]);
		const plan = planTopicalAssignments(students, [
			{ studentId: 'a', mode: 'team', team: 2 },
			{ studentId: 'b', mode: 'individual' },
			{ studentId: 'c', mode: 'unassigned' },
		]);
		expect(plan.teams.get(2)).toEqual([{ studentId: 'a', competingGrade: 10 }]);
		expect(plan.individuals).toEqual(['b']);
		expect(() => planTopicalAssignments(students, [{ studentId: 'a', mode: 'crew' as never }])).toThrowError(expect.objectContaining({ code: 'invalid_assignment' }));
	});

	it('exposes a stable domain error type', () => {
		expect(new RegistrationError('example', 'example')).toBeInstanceOf(Error);
	});
});
