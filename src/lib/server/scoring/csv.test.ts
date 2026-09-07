import { describe, expect, it } from 'vitest';
import { exportScoreCsv, parseScoreCsv, validateScoreCsv, type ScoreCsvEntry } from './csv';

const entries: ScoreCsvEntry[] = [
	{ id: 'entry-project', category: 'project', division: 1, entryNumber: 1, schoolName: 'Alpha', score: 0, part1: null, part2: null, placement: null, version: 2 },
	{ id: 'entry-topical', category: 'topical_individual', division: 2, entryNumber: 1, schoolName: 'Beta', score: 137, part1: 65, part2: 72, placement: null, version: 3 },
	{ id: 'entry-blank', category: 'knowdown', division: 1, entryNumber: 2, schoolName: 'Beta', score: null, part1: null, part2: null, placement: null, version: 0 },
];

describe('score CSV', () => {
	it('round trips blank, zero, topical totals, and versions', () => {
		const rows = parseScoreCsv(exportScoreCsv(entries));
		expect(validateScoreCsv(rows, entries).errors).toEqual([]);
		expect(rows.find((row) => row.id === 'entry-project')?.score).toBe(0);
		expect(rows.find((row) => row.id === 'entry-blank')?.score).toBeNull();
	});

	it('rejects stale IDs, stale versions, and edited topical totals', () => {
		const rows = parseScoreCsv(exportScoreCsv(entries));
		rows.find((row) => row.id === 'entry-project')!.id = 'stale-entry';
		const topical = rows.find((row) => row.id === 'entry-topical')!;
		topical.version = 2;
		topical.score = 999;
		const preview = validateScoreCsv(rows, entries);
		expect(preview.errors.map((error) => error.field)).toEqual(expect.arrayContaining(['entry_id', 'version', 'score']));
	});

	it('rejects spreadsheet formulas in numeric fields', () => {
		const csv = exportScoreCsv(entries).replace(',"Alpha","0",', ',"Alpha","=1+1",');
		const preview = validateScoreCsv(parseScoreCsv(csv), entries);
		expect(preview.errors.some((error) => error.field === 'score')).toBe(true);
	});
});
