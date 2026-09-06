import { validateGrade, validatePlayUp } from '$lib/validation';

export const registrationCsvFormat = 'wsmc.registration.v1';

export const registrationCsvHeaders = [
	'format_version', 'student_id', 'student_name', 'actual_grade', 'rostered',
	'project_entry_id', 'project_entry_number', 'project_competing_grade',
	'team_contest_entry_id', 'team_contest_entry_number', 'team_contest_competing_grade',
	'topical_team_entry_id', 'topical_team_entry_number', 'topical_team_competing_grade',
	'topical_individual_entry_id', 'topical_individual_entry_number',
	'knowdown_entry_id', 'knowdown_entry_number', 'knowdown_selected',
] as const;

export type RegistrationCsvCategory = 'project' | 'team_contest' | 'topical_team' | 'topical_individual' | 'knowdown';
type TeamCategory = 'project' | 'team_contest' | 'topical_team';
const categories: RegistrationCsvCategory[] = ['project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown'];
const teamCategories = new Set<TeamCategory>(['project', 'team_contest', 'topical_team']);

export type RegistrationCsvSnapshot = {
	students: { id: string; name: string; actualGrade: number }[];
	rosterIds: string[];
	entries: { id: string; category: RegistrationCsvCategory; entryNumber: number | null; entryKind: 'team' | 'individual'; ownerSchoolId: string | null }[];
	members: { entryId: string; annualStudentId: string; competingGrade: number | null }[];
};

export type RegistrationCsvEntryRef = {
	entryId: string | null;
	entryNumber: number | null;
	competingGrade: number | null;
	selected: boolean;
};

export type RegistrationCsvRow = {
	rowNumber: number;
	studentId: string | null;
	studentName: string;
	actualGrade: number;
	rostered: boolean;
	entries: Record<RegistrationCsvCategory, RegistrationCsvEntryRef>;
};

export type RegistrationCsvRowError = { rowNumber: number; field: string; message: string };

export type RegistrationCsvPreview = {
	rows: RegistrationCsvRow[];
	errors: RegistrationCsvRowError[];
	newStudents: number;
	updatedStudents: number;
	rosterSelections: number;
	categorySelections: number;
};

export class RegistrationCsvError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'RegistrationCsvError';
	}
}

function protectSpreadsheetText(value: string): string {
	const trimmed = value.trim();
	return /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

function unprotectSpreadsheetText(value: string): string {
	return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function csvCell(value: string | number | null | undefined): string {
	const text = value === null || value === undefined ? '' : protectSpreadsheetText(String(value));
	return `"${text.replaceAll('"', '""')}"`;
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
			row.push(unprotectSpreadsheetText(cell.trim())); cell = '';
		} else if (character === '\n' || character === '\r') {
			if (character === '\r' && source[index + 1] === '\n') index += 1;
			row.push(unprotectSpreadsheetText(cell.trim())); cell = '';
			if (row.some((value) => value.length > 0)) records.push(row);
			row = [];
		} else {
			cell += character;
		}
	}
	if (quoted) throw new RegistrationCsvError('malformed_csv', 'The CSV contains an unterminated quoted field.');
	if (cell.length > 0 || row.length > 0) {
		row.push(unprotectSpreadsheetText(cell.trim()));
		if (row.some((value) => value.length > 0)) records.push(row);
	}
	return records;
}

function value(record: Record<string, string>, field: string): string {
	return record[field]?.trim() ?? '';
}

function numberValue(record: Record<string, string>, field: string): number | null {
	const raw = value(record, field);
	if (!raw) return null;
	const parsed = Number(raw);
	return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function yesNo(record: Record<string, string>, field: string, defaultValue: boolean | null): boolean | null {
	const raw = value(record, field).toLowerCase();
	if (!raw && defaultValue !== null) return defaultValue;
	if (raw === 'yes' || raw === 'y' || raw === 'true') return true;
	if (raw === 'no' || raw === 'n' || raw === 'false') return false;
	return null;
}

function entryRef(record: Record<string, string>, category: RegistrationCsvCategory): RegistrationCsvEntryRef {
	const entryId = value(record, `${category}_entry_id`) || null;
	const entryNumber = numberValue(record, `${category}_entry_number`);
	const competingGrade = teamCategories.has(category as TeamCategory) ? numberValue(record, `${category}_competing_grade`) : null;
	return { entryId, entryNumber, competingGrade, selected: category === 'knowdown' ? yesNo(record, 'knowdown_selected', false) === true : Boolean(entryId || entryNumber !== null) };
}

export function exportRegistrationCsv(snapshot: RegistrationCsvSnapshot): string {
	const membersByStudent = new Map<string, RegistrationCsvEntryRef[]>();
	const entriesById = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
	for (const member of snapshot.members) {
		const entry = entriesById.get(member.entryId);
		if (!entry) continue;
		const list = membersByStudent.get(member.annualStudentId) ?? [];
		list.push({ entryId: entry.id, entryNumber: entry.entryNumber, competingGrade: member.competingGrade, selected: true });
		membersByStudent.set(member.annualStudentId, list);
	}

	const rows = [registrationCsvHeaders.join(',')];
	for (const student of [...snapshot.students].sort((a, b) => a.name.localeCompare(b.name))) {
		const refs = new Map<RegistrationCsvCategory, RegistrationCsvEntryRef>();
		for (const category of categories) refs.set(category, { entryId: null, entryNumber: null, competingGrade: null, selected: false });
		for (const member of membersByStudent.get(student.id) ?? []) {
			if (!member.entryId) continue;
			const entry = entriesById.get(member.entryId);
			if (entry) refs.set(entry.category as RegistrationCsvCategory, member);
		}
		const fields: (string | number | null)[] = [registrationCsvFormat, student.id, student.name, student.actualGrade, snapshot.rosterIds.includes(student.id) ? 'yes' : 'no'];
		for (const category of ['project', 'team_contest', 'topical_team'] as TeamCategory[]) {
			const ref = refs.get(category)!;
			fields.push(ref.entryId, ref.entryNumber, ref.competingGrade);
		}
		for (const category of ['topical_individual'] as RegistrationCsvCategory[]) {
			const ref = refs.get(category)!;
			fields.push(ref.entryId, ref.entryNumber);
		}
		const knowdown = refs.get('knowdown')!;
		fields.push(knowdown.entryId, knowdown.entryNumber, knowdown.selected ? 'yes' : 'no');
		rows.push(fields.map(csvCell).join(','));
	}
	return `${rows.join('\r\n')}\r\n`;
}

export function parseRegistrationCsv(text: string): RegistrationCsvRow[] {
	const records = parseCsvRecords(text);
	if (records.length < 2) throw new RegistrationCsvError('empty_csv', 'The CSV file must include a header and at least one student row.');
	const header = records[0];
	if (header.length !== registrationCsvHeaders.length || header.some((field, index) => field !== registrationCsvHeaders[index])) {
		throw new RegistrationCsvError('invalid_header', 'Use the current WSMC registration CSV template without renaming or reordering columns.');
	}
	return records.slice(1).map((cells, index) => {
		if (cells.length !== registrationCsvHeaders.length) throw new RegistrationCsvError('invalid_row', `Row ${index + 2} has ${cells.length} columns; expected ${registrationCsvHeaders.length}.`);
		const record = Object.fromEntries(registrationCsvHeaders.map((field, fieldIndex) => [field, cells[fieldIndex]])) as Record<string, string>;
		if (value(record, 'format_version') !== registrationCsvFormat) throw new RegistrationCsvError('invalid_version', `Row ${index + 2} is not a ${registrationCsvFormat} record.`);
		const actualGrade = numberValue(record, 'actual_grade');
		const rostered = yesNo(record, 'rostered', null);
		return {
			rowNumber: index + 2,
			studentId: value(record, 'student_id') || null,
			studentName: value(record, 'student_name'),
			actualGrade: actualGrade ?? Number.NaN,
			rostered: rostered ?? false,
			entries: Object.fromEntries(categories.map((category) => [category, entryRef(record, category)])) as Record<RegistrationCsvCategory, RegistrationCsvEntryRef>,
		};
	});
}

function addError(errors: RegistrationCsvRowError[], rowNumber: number, field: string, message: string): void {
	errors.push({ rowNumber, field, message });
}

function entryKey(ref: RegistrationCsvEntryRef, category: RegistrationCsvCategory): string | null {
	if (ref.entryId) return `id:${ref.entryId}`;
	if (ref.entryNumber !== null && Number.isInteger(ref.entryNumber)) return `new:${category}:${ref.entryNumber}`;
	return null;
}

function resolvedEntryKey(ref: RegistrationCsvEntryRef, category: RegistrationCsvCategory, snapshot: RegistrationCsvSnapshot): string | null {
	if (ref.entryId) return `id:${ref.entryId}`;
	if (ref.entryNumber !== null && Number.isInteger(ref.entryNumber)) {
		const existing = snapshot.entries.find((entry) => entry.category === category && entry.entryNumber === ref.entryNumber);
		return existing ? `id:${existing.id}` : `new:${category}:${ref.entryNumber}`;
	}
	return null;
}

export function validateRegistrationCsv(rows: RegistrationCsvRow[], snapshot: RegistrationCsvSnapshot): RegistrationCsvPreview {
	const errors: RegistrationCsvRowError[] = [];
	const studentIds = new Set(snapshot.students.map((student) => student.id));
	const entriesById = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
	const seenIds = new Set<string>();
	const seenNewNames = new Set<string>();
	const teamGroups = new Map<string, { rowNumber: number; competingGrade: number | null }[]>();
	const knowdownGroups = new Map<string, number[]>();
	let newStudents = 0;
	let updatedStudents = 0;
	let rosterSelections = 0;
	let categorySelections = 0;

	for (const row of rows) {
		if (!row.studentName) addError(errors, row.rowNumber, 'student_name', 'Student name is required.');
		if (!Number.isInteger(row.actualGrade) || validateGrade(row.actualGrade)) addError(errors, row.rowNumber, 'actual_grade', 'Actual grade must be 9, 10, 11, or 12.');
		if (row.studentId) {
			if (seenIds.has(row.studentId)) addError(errors, row.rowNumber, 'student_id', 'Student ID appears more than once in this file.');
			seenIds.add(row.studentId);
			if (!studentIds.has(row.studentId)) addError(errors, row.rowNumber, 'student_id', 'Student ID is stale or does not belong to this school and season.');
			else updatedStudents += 1;
		} else {
			const nameKey = row.studentName.toLocaleLowerCase();
			if (seenNewNames.has(nameKey)) addError(errors, row.rowNumber, 'student_name', 'Duplicate new student name; add a stable student_id before importing.');
			seenNewNames.add(nameKey);
			newStudents += 1;
		}
		if (row.rostered) rosterSelections += 1;
		for (const category of categories) {
			const ref = row.entries[category];
			const hasReference = Boolean(ref.entryId || ref.entryNumber !== null);
			if (category === 'knowdown' && ref.selected !== hasReference) addError(errors, row.rowNumber, 'knowdown_selected', 'Knowdown selection must be yes when a Knowdown entry is specified.');
			if (hasReference) {
				categorySelections += 1;
				if (!row.rostered) addError(errors, row.rowNumber, `${category}_entry_id`, 'Only rostered students can be entered in a category.');
				if (ref.entryId) {
					const entry = entriesById.get(ref.entryId);
					if (!entry || entry.category !== category || entry.ownerSchoolId === null) addError(errors, row.rowNumber, `${category}_entry_id`, 'Entry ID is stale or belongs to another contest, school, or category.');
					else if (ref.entryNumber !== null && ref.entryNumber !== entry.entryNumber) addError(errors, row.rowNumber, `${category}_entry_number`, 'Entry number does not match the stable entry ID.');
				} else if (ref.entryNumber === null || !Number.isInteger(ref.entryNumber) || ref.entryNumber < 1) {
					addError(errors, row.rowNumber, `${category}_entry_number`, 'New entries require a positive integer entry number.');
				}
				if (teamCategories.has(category as TeamCategory)) {
					if (!Number.isInteger(ref.competingGrade) || ref.competingGrade === null) addError(errors, row.rowNumber, `${category}_competing_grade`, 'Team entries require a competing grade.');
					else if (Number.isInteger(row.actualGrade) && validatePlayUp(row.actualGrade, ref.competingGrade)) addError(errors, row.rowNumber, `${category}_competing_grade`, validatePlayUp(row.actualGrade, ref.competingGrade)!);
					const key = resolvedEntryKey(ref, category, snapshot);
					if (key) {
						const group = teamGroups.get(`${category}:${key}`) ?? [];
						group.push({ rowNumber: row.rowNumber, competingGrade: ref.competingGrade });
						teamGroups.set(`${category}:${key}`, group);
					}
				} else if (ref.competingGrade !== null) addError(errors, row.rowNumber, `${category}_competing_grade`, 'Individual entries must leave competing grade blank.');
			}
			if (category === 'topical_individual' && ref.entryId === null && ref.entryNumber === null && ref.competingGrade !== null) addError(errors, row.rowNumber, 'topical_individual_competing_grade', 'Individual entries do not use competing grade.');
		}
	}

	const importedStudentIds = new Set(rows.filter((row) => row.studentId).map((row) => row.studentId!));
	for (const [key, group] of teamGroups) {
		const [, , entryId] = key.split(':');
		const existingMembers = entryId ? snapshot.members.filter((member) => member.entryId === entryId && !importedStudentIds.has(member.annualStudentId)) : [];
		if (existingMembers.length + group.length > 3) for (const member of group.slice(Math.max(0, 3 - existingMembers.length))) addError(errors, member.rowNumber, key.split(':')[0], 'A team may have at most 3 members.');
		const grades = new Set<number>();
		for (const member of existingMembers) if (member.competingGrade !== null) grades.add(member.competingGrade);
		for (const member of group) if (member.competingGrade !== null) {
			if (grades.has(member.competingGrade)) addError(errors, member.rowNumber, key.split(':')[0], 'Team members must have distinct competing grades.');
			grades.add(member.competingGrade);
		}
	}
	for (const row of rows) {
		const topicalTeam = row.entries.topical_team.entryId || row.entries.topical_team.entryNumber !== null;
		const topicalIndividual = row.entries.topical_individual.entryId || row.entries.topical_individual.entryNumber !== null;
		if (topicalTeam && topicalIndividual) addError(errors, row.rowNumber, 'topical_team_entry_id', 'A student cannot compete in both Topical Team and Topical Individual.');
		const knowdown = row.entries.knowdown;
		const key = resolvedEntryKey(knowdown, 'knowdown', snapshot);
		if (knowdown.selected && key) {
			const group = knowdownGroups.get(key) ?? [];
			group.push(row.rowNumber); knowdownGroups.set(key, group);
		}
	}
	for (const [key, group] of knowdownGroups) {
		const [, , entryId] = key.split(':');
		const existingCount = entryId ? snapshot.members.filter((member) => member.entryId === entryId && !importedStudentIds.has(member.annualStudentId)).length : 0;
		for (const rowNumber of group.slice(Math.max(0, 3 - existingCount))) addError(errors, rowNumber, 'knowdown_selected', 'A school may designate at most 3 Knowdown competitors.');
	}
	return { rows, errors, newStudents, updatedStudents, rosterSelections, categorySelections };
}
