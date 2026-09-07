export const stateRosterCsvFormat = 'wsmc.state-roster.v1';
export const stateRosterCsvHeaders = [
	'format_version', 'contest_id', 'school_id', 'school_name', 'annual_student_id',
	'student_name', 'actual_grade', 'admission_basis', 'qualification_id', 'state_entry_id',
] as const;

function safeCell(value: string | number | null | undefined): string {
	const raw = value === null || value === undefined ? '' : String(value);
	const safe = /^[=+\-@]/.test(raw.trim()) ? `'${raw.trim()}` : raw;
	return `"${safe.replaceAll('"', '""')}"`;
}

export type StateRosterCsvRow = {
	contestId: string;
	schoolId: string;
	schoolName: string;
	annualStudentId: string;
	studentName: string;
	actualGrade: number;
	admissionBasis: 'individual_qualification' | 'team_berth';
	qualificationId: string | null;
	stateEntryId: string | null;
};

export function exportStateRosterCsv(rows: StateRosterCsvRow[]): string {
	const output = [stateRosterCsvHeaders.join(',')];
	for (const row of [...rows].sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.studentName.localeCompare(b.studentName) || a.annualStudentId.localeCompare(b.annualStudentId))) {
		output.push([
			stateRosterCsvFormat, row.contestId, row.schoolId, row.schoolName, row.annualStudentId,
			row.studentName, row.actualGrade, row.admissionBasis, row.qualificationId, row.stateEntryId,
		].map(safeCell).join(','));
	}
	return `${output.join('\r\n')}\r\n`;
}
