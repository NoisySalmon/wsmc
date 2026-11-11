import { validateGrade } from '$lib/validation';

export const registrationCsvHeaders = ['Student name', 'Grade', 'Team contest team', 'Topical team', 'Knowdown'] as const;

export type RegistrationCsvCategory = 'project' | 'team_contest' | 'topical_team' | 'topical_individual' | 'knowdown';
const categories: RegistrationCsvCategory[] = ['project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown'];

export type RegistrationCsvSnapshot = {
	students: { id: string; name: string; actualGrade: number }[];
	entries: { id: string; category: RegistrationCsvCategory; entryNumber: number | null; entryKind: 'team' | 'individual'; ownerSchoolId: string | null }[];
};

export type RegistrationCsvEntryRef = {
	entryId: string | null;
	entryNumber: number | null;
	competingGrade: number | null;
	selected: boolean;
};

export type RegistrationCsvRow = {
	rowNumber: number;
	parsingErrors?: RegistrationCsvRowError[];
	studentName: string;
	actualGrade: number;
	entries: Record<RegistrationCsvCategory, RegistrationCsvEntryRef>;
};

export type RegistrationCsvRowError = { rowNumber: number; field: string; message: string };

export type RegistrationCsvPreview = {
	rows: RegistrationCsvRow[];
	errors: RegistrationCsvRowError[];
	newStudents: number;
	duplicateRows: number;
	skippedRows: number;
	rosterSelections: number;
	categorySelections: number;
};

export class RegistrationCsvError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'RegistrationCsvError';
	}
}

function parseCsvRecords(text: string): string[][] {
	const source = text.replace(/^\uFEFF/, '');
	const records: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (quoted) {
			if (character === '"' && source[index + 1] === '"') {
				cell += '"'; index += 1;
			} else if (character === '"') {
				quoted = false;
			} else {
				cell += character;
			}
		} else if (character === '"' && cell.length === 0) {
			quoted = true;
		} else if (character === ',') {
			row.push(cell.trim()); cell = '';
		} else if (character === '\n' || character === '\r') {
			if (character === '\r' && source[index + 1] === '\n') index += 1;
			row.push(cell.trim()); cell = '';
			records.push(row);
			row = [];
		} else {
			cell += character;
		}
	}
	if (quoted) throw new RegistrationCsvError('malformed_csv', 'The CSV contains an unterminated quoted field.');
	if (cell.length > 0 || row.length > 0) {
		row.push(cell.trim());
		records.push(row);
	}
	return records;
}

export function exportRegistrationCsv(): string {
	return `${registrationCsvHeaders.join(',')}\r\n`;
}

export function parseRegistrationCsv(text: string): RegistrationCsvRow[] {
	const records = parseCsvRecords(text);
	const header = records.shift();
	if (!header || header.length !== registrationCsvHeaders.length || header.some((field, index) => field.toLowerCase() !== registrationCsvHeaders[index].toLowerCase())) {
		throw new RegistrationCsvError('invalid_header', 'Use the registration CSV template without renaming or reordering columns.');
	}
	return records.map((cells, index) => {
		const [studentName = '', grade = '', team = '', topical = '', knowdown = ''] = cells;
		const entries = Object.fromEntries(categories.map(category => [category, { entryId: null, entryNumber: null, competingGrade: null, selected: false }])) as RegistrationCsvRow['entries'];
		const actualGrade = grade ? Number(grade) : Number.NaN;
		for (const [category, raw] of [['team_contest', team], ['topical_team', topical]] as const) {
			if (raw) entries[category] = { entryId: null, entryNumber: Number(raw), competingGrade: actualGrade, selected: true };
		}
		entries.topical_individual.selected = !topical;
		entries.knowdown.selected = /^(yes|y|true)$/i.test(knowdown);
		const row = { rowNumber: index + 2, studentName, actualGrade, entries };
		// Retain row-level parsing problems for preview, without rejecting other students.
		const errors: RegistrationCsvRowError[] = [];
		if (cells.length > registrationCsvHeaders.length) errors.push({ rowNumber: row.rowNumber, field: 'Columns', message: 'Too many columns.' });
		if (knowdown && !/^(yes|y|true|no|n|false)$/i.test(knowdown)) errors.push({ rowNumber: row.rowNumber, field: 'Knowdown', message: 'Use Yes, No, or blank.' });
		return { ...row, parsingErrors: errors };
	});
}

function studentKey(name: string, grade: number): string {
	return `${name.trim().replace(/\s+/g, ' ').toLowerCase()}|${grade}`;
}

export function validateRegistrationCsv(rows: RegistrationCsvRow[], snapshot: RegistrationCsvSnapshot): RegistrationCsvPreview {
	const seen = new Set(snapshot.students.map(student => studentKey(student.name, student.actualGrade)));
	const accepted: RegistrationCsvRow[] = [];
	const errors: RegistrationCsvRowError[] = [];
	let duplicateRows = 0;
	let skippedRows = 0;
	for (const row of rows) {
		const problems = [...(row.parsingErrors ?? [])];
		if (!row.studentName) problems.push({ rowNumber: row.rowNumber, field: 'Student name', message: 'Missing student name; row skipped.' });
		if (!Number.isInteger(row.actualGrade) || validateGrade(row.actualGrade)) problems.push({ rowNumber: row.rowNumber, field: 'Grade', message: 'Grade must be 9, 10, 11, or 12; row skipped.' });
		for (const category of ['team_contest', 'topical_team'] as const) {
			const number = row.entries[category].entryNumber;
			if (number !== null && (!Number.isSafeInteger(number) || number < 1)) problems.push({ rowNumber: row.rowNumber, field: category === 'team_contest' ? 'Team contest team' : 'Topical team', message: 'Use a positive whole team number or leave blank; row skipped.' });
		}
		if (problems.length) { errors.push(...problems); skippedRows++; continue; }
		const key = studentKey(row.studentName, row.actualGrade);
		if (seen.has(key)) { duplicateRows++; continue; }
		seen.add(key);
		accepted.push(row);
	}
	return { rows: accepted, errors, newStudents: accepted.length, duplicateRows, skippedRows, rosterSelections: accepted.length, categorySelections: accepted.reduce((count, row) => count + categories.filter(category => row.entries[category].selected).length, 0) };
}
