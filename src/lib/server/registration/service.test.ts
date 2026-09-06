import { describe, expect, it } from 'vitest';
import { RegistrationError, addRosterStudent, createAnnualStudent, createCategoryEntry, reopenRoster } from './service';

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

	it('exposes a stable domain error type', () => {
		expect(new RegistrationError('example', 'example')).toBeInstanceOf(Error);
	});
});
