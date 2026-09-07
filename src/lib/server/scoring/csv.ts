import { validateScoreInput, type ScoreCategory, type ScoreInput } from './service';

export const scoreCsvFormat = 'wsmc.scores.v1';
export const scoreCsvHeaders = ['format_version', 'entry_id', 'category', 'division', 'entry_number', 'school_name', 'score', 'part1', 'part2', 'placement', 'version'] as const;

export type ScoreCsvEntry = {
	id: string;
	category: ScoreCategory;
	division: number;
	entryNumber: number | null;
	schoolName: string;
	score: number | null;
	part1: number | null;
	part2: number | null;
	placement: number | null;
	version: number;
};

export type ScoreCsvRow = ScoreCsvEntry & { rowNumber: number };
export type ScoreCsvRowError = { rowNumber: number; field: string; message: string };
export type ScoreCsvPreview = { rows: ScoreCsvRow[]; errors: ScoreCsvRowError[]; updatedRows: number; clearedRows: number };

export class ScoreCsvError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'ScoreCsvError';
	}
}

function csvCell(value: string | number | null): string {
	const text = value === null ? '' : String(value);
	return `"${text.replaceAll('"', '""')}"`;
}

function parseRecords(text: string): string[][] {
	const source = text.replace(/^\uFEFF/, '');
	const records: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (quoted) {
			if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
			else if (character === '"') quoted = false;
			else cell += character;
		} else if (character === '"' && cell.length === 0) quoted = true;
		else if (character === ',') { row.push(cell.trim()); cell = ''; }
		else if (character === '\n' || character === '\r') {
			if (character === '\r' && source[index + 1] === '\n') index += 1;
			row.push(cell.trim()); cell = '';
			if (row.some((value) => value.length > 0)) records.push(row);
			row = [];
		} else cell += character;
	}
	if (quoted) throw new ScoreCsvError('malformed_csv', 'The CSV contains an unterminated quoted field.');
	if (cell.length > 0 || row.length > 0) { row.push(cell.trim()); if (row.some((value) => value.length > 0)) records.push(row); }
	return records;
}

function numberValue(record: Record<string, string>, field: string): number | null {
	const raw = record[field]?.trim() ?? '';
	if (!raw) return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : Number.NaN;
}

export function exportScoreCsv(entries: ScoreCsvEntry[]): string {
	const rows = [scoreCsvHeaders.join(',')];
	for (const entry of [...entries].sort((a, b) => a.category.localeCompare(b.category) || a.division - b.division || (a.entryNumber ?? 0) - (b.entryNumber ?? 0) || a.id.localeCompare(b.id))) {
		rows.push([scoreCsvFormat, entry.id, entry.category, entry.division, entry.entryNumber, entry.schoolName, entry.score, entry.part1, entry.part2, entry.placement, entry.version].map((value) => csvCell(value)).join(','));
	}
	return `${rows.join('\r\n')}\r\n`;
}

export function parseScoreCsv(text: string): ScoreCsvRow[] {
	const records = parseRecords(text);
	if (records.length < 2) throw new ScoreCsvError('empty_csv', 'The CSV file must include a header and at least one score row.');
	if (records[0].length !== scoreCsvHeaders.length || records[0].some((field, index) => field !== scoreCsvHeaders[index])) throw new ScoreCsvError('invalid_header', 'Use the current WSMC score CSV template without renaming or reordering columns.');
	return records.slice(1).map((cells, index) => {
		if (cells.length !== scoreCsvHeaders.length) throw new ScoreCsvError('invalid_row', `Row ${index + 2} has ${cells.length} columns; expected ${scoreCsvHeaders.length}.`);
		const record = Object.fromEntries(scoreCsvHeaders.map((field, fieldIndex) => [field, cells[fieldIndex]])) as Record<string, string>;
		if (record.format_version !== scoreCsvFormat) throw new ScoreCsvError('invalid_version', `Row ${index + 2} is not a ${scoreCsvFormat} record.`);
		const division = numberValue(record, 'division');
		const entryNumber = numberValue(record, 'entry_number');
		const score = numberValue(record, 'score');
		const part1 = numberValue(record, 'part1');
		const part2 = numberValue(record, 'part2');
		const placement = numberValue(record, 'placement');
		return { rowNumber: index + 2, id: record.entry_id.trim(), category: record.category.trim() as ScoreCategory, division: division ?? Number.NaN, entryNumber, schoolName: record.school_name.trim(), score, part1, part2, placement, version: numberValue(record, 'version') ?? Number.NaN };
	});
}

function addError(errors: ScoreCsvRowError[], rowNumber: number, field: string, message: string) { errors.push({ rowNumber, field, message }); }

export function validateScoreCsv(rows: ScoreCsvRow[], entries: ScoreCsvEntry[]): ScoreCsvPreview {
	const errors: ScoreCsvRowError[] = [];
	const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
	const seen = new Set<string>();
	let updatedRows = 0;
	let clearedRows = 0;
	for (const row of rows) {
		const entry = entriesById.get(row.id);
		if (!row.id) addError(errors, row.rowNumber, 'entry_id', 'Entry ID is required.');
		else if (seen.has(row.id)) addError(errors, row.rowNumber, 'entry_id', 'Entry ID appears more than once in this file.');
		else seen.add(row.id);
		if (!entry) addError(errors, row.rowNumber, 'entry_id', 'Entry ID is stale or belongs to another contest.');
		if (!Number.isInteger(row.division) || (row.division !== 1 && row.division !== 2)) addError(errors, row.rowNumber, 'division', 'Division must be 1 or 2.');
		if (!Number.isInteger(row.version) || row.version < 0) addError(errors, row.rowNumber, 'version', 'Version must be a non-negative integer.');
		for (const field of ['score', 'part1', 'part2', 'placement'] as const) if (Number.isNaN(row[field])) addError(errors, row.rowNumber, field, `${field} must be a number or blank.`);
		if (entry) {
			if (row.category !== entry.category) addError(errors, row.rowNumber, 'category', 'Category does not match the stable entry ID.');
			if (row.division !== entry.division) addError(errors, row.rowNumber, 'division', 'Division does not match the stable entry ID.');
			if (row.entryNumber !== entry.entryNumber) addError(errors, row.rowNumber, 'entry_number', 'Entry number does not match the stable entry ID.');
			if (row.version !== entry.version) addError(errors, row.rowNumber, 'version', `This row is stale; current version is ${entry.version}.`);
			try {
				// Topical exports include a derived total for readability, while the
				// shared validator accepts only the two source parts.
				const values = validateScoreInput(row.category, { ...row, score: null } as ScoreInput);
				if (row.category === 'topical_team' || row.category === 'topical_individual') {
					if (row.score !== null && (values.score === null || row.score !== values.score)) addError(errors, row.rowNumber, 'score', 'Topical total must equal Part 1 plus Part 2, or be blank.');
				}
			} catch (cause) { addError(errors, row.rowNumber, 'score', cause instanceof Error ? cause.message : 'Invalid score.'); }
			if (row.score === null && row.part1 === null && row.part2 === null && row.placement === null) clearedRows += 1;
			else updatedRows += 1;
		}
	}
	return { rows, errors, updatedRows, clearedRows };
}
