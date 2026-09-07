import { describe, expect, it } from 'vitest';
import { exportStateRosterCsv, stateRosterCsvFormat } from './csv';

describe('state roster CSV', () => {
	it('exports stable IDs and protects spreadsheet formulas', () => {
		const csv = exportStateRosterCsv([{ contestId: 'state-1', schoolId: 'school-1', schoolName: '=Unsafe', annualStudentId: 'student-1', studentName: '@Formula', actualGrade: 10, admissionBasis: 'individual_qualification', qualificationId: 'qualification-1', stateEntryId: null }]);
		expect(csv.split('\r\n')[0]).toContain('format_version');
		expect(csv).toContain(`"${stateRosterCsvFormat}"`);
		expect(csv).toContain("'=Unsafe");
		expect(csv).toContain("'@Formula");
	});
});
