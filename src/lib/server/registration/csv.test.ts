import { describe, expect, it } from 'vitest';
import fixture from './fixtures/new-student.csv?raw';
import {
	exportRegistrationCsv, parseRegistrationCsv, registrationCsvHeaders, registrationCsvFormat, validateRegistrationCsv,
} from './csv';
import { loadRegistrationCsvScope } from './csv-service';

const snapshot = {
	students: [
		{ id: 'student-1', name: 'Ada Alpha', actualGrade: 12 },
		{ id: 'student-2', name: 'Bea Alpha', actualGrade: 11 },
	],
	rosterIds: ['student-1', 'student-2'],
	entries: [
		{ id: 'entry-project', category: 'project' as const, entryNumber: 1, entryKind: 'team' as const, ownerSchoolId: 'school-1' },
		{ id: 'entry-team-contest', category: 'team_contest' as const, entryNumber: 1, entryKind: 'team' as const, ownerSchoolId: 'school-1' },
		{ id: 'entry-topical-team', category: 'topical_team' as const, entryNumber: 1, entryKind: 'team' as const, ownerSchoolId: 'school-1' },
		{ id: 'entry-topical', category: 'topical_individual' as const, entryNumber: 1, entryKind: 'individual' as const, ownerSchoolId: 'school-1' },
		{ id: 'entry-knowdown', category: 'knowdown' as const, entryNumber: 1, entryKind: 'individual' as const, ownerSchoolId: 'school-1' },
	],
	members: [
		{ entryId: 'entry-project', annualStudentId: 'student-1', competingGrade: 12 },
		{ entryId: 'entry-project', annualStudentId: 'student-2', competingGrade: 11 },
		{ entryId: 'entry-team-contest', annualStudentId: 'student-1', competingGrade: 12 },
		{ entryId: 'entry-team-contest', annualStudentId: 'student-2', competingGrade: 11 },
		{ entryId: 'entry-topical-team', annualStudentId: 'student-2', competingGrade: 11 },
		{ entryId: 'entry-topical', annualStudentId: 'student-1', competingGrade: null },
		{ entryId: 'entry-knowdown', annualStudentId: 'student-2', competingGrade: null },
	],
};

function csvRow(values: (string | number)[]): string {
	return values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',');
}

describe('registration CSV format', () => {
	it('round-trips a complete exported registration without validation errors', () => {
		const csv = exportRegistrationCsv(snapshot);
		const rows = parseRegistrationCsv(csv);
		const preview = validateRegistrationCsv(rows, snapshot);
		expect(preview.errors).toEqual([]);
		expect(rows).toHaveLength(2);
		expect(rows[0].entries.project.entryId).toBe('entry-project');
		expect(rows[1].entries.knowdown.selected).toBe(true);
	});

	it('protects and restores formula-looking student names', () => {
		const csv = exportRegistrationCsv({ ...snapshot, students: [{ ...snapshot.students[0], name: '=HYPERLINK("https://example.test")' }] });
		expect(csv).toContain("'=HYPERLINK");
		expect(parseRegistrationCsv(csv)[0].studentName).toBe('=HYPERLINK("https://example.test")');
	});

	it('rejects stale student IDs and duplicate new names', () => {
		const stale = exportRegistrationCsv(snapshot).replace('student-1', 'stale-student');
		const stalePreview = validateRegistrationCsv(parseRegistrationCsv(stale), snapshot);
		expect(stalePreview.errors.some((error) => error.field === 'student_id')).toBe(true);

		const emptyStudentId = Array.from({ length: registrationCsvHeaders.length }, () => '');
		emptyStudentId[0] = registrationCsvFormat;
		emptyStudentId[2] = 'New Student';
		emptyStudentId[3] = '10';
		emptyStudentId[4] = 'yes';
		const duplicateCsv = [registrationCsvHeaders.join(','), csvRow(emptyStudentId), csvRow(emptyStudentId)].join('\n');
		const duplicatePreview = validateRegistrationCsv(parseRegistrationCsv(duplicateCsv), snapshot);
		expect(duplicatePreview.errors.some((error) => error.message.includes('Duplicate new student name'))).toBe(true);
	});

	it('rejects invalid team membership in the preview', () => {
		const row = Array.from({ length: registrationCsvHeaders.length }, () => '');
		row[0] = registrationCsvFormat; row[1] = 'student-1'; row[2] = 'Ada Alpha'; row[3] = '12'; row[4] = 'yes';
		row[5] = 'entry-project'; row[6] = '1'; row[7] = '11';
		const preview = validateRegistrationCsv(parseRegistrationCsv([registrationCsvHeaders.join(','), csvRow(row)].join('\n')), snapshot);
		expect(preview.errors.some((error) => error.field === 'project_entry_id' && error.message.includes('stale'))).toBe(false);
		expect(preview.errors.some((error) => error.field === 'project_competing_grade' && error.message.toLowerCase().includes('competing grade'))).toBe(true);
	});

	it('previews a new-student fixture without requiring a stable ID', () => {
		const preview = validateRegistrationCsv(parseRegistrationCsv(fixture), snapshot);
		expect(preview.errors).toEqual([]);
		expect(preview.newStudents).toBe(1);
		expect(preview.categorySelections).toBe(1);
	});

	it('rejects CSV scope access for a locked contest', async () => {
		let selectCount = 0;
		const db = { select: () => ({ from: () => ({ where: async () => {
			selectCount += 1;
			if (selectCount === 1) return [{ kind: 'regional', lifecycle: 'roster_locked', seasonId: 'season-1' }];
			if (selectCount === 2) return [{ active: true }];
			return [{ id: 'participation-1' }];
		} }) }) };
		await expect(loadRegistrationCsvScope(db as never, 'contest-1', 'school-1')).rejects.toMatchObject({ code: 'locked' });
	});
});
