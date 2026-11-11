import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDb } from '$lib/server/db';
import { exportRegistrationCsv, parseRegistrationCsv, validateRegistrationCsv } from './csv';
import { importRegistrationCsv, previewRegistrationCsv } from './csv-service';
import { getRegistrationReadiness } from './readiness';

const header = 'Student name,Grade,Team contest team,Topical team,Knowdown\n';
const empty = { students: [], rosterIds: [], entries: [], members: [] };

describe('school CSV uploads', () => {
	it('downloads an empty usable template and reads quoted spreadsheet cells', () => {
		expect(exportRegistrationCsv()).toBe(header.replace('\n', '\r\n'));
		const preview = validateRegistrationCsv(parseRegistrationCsv('\uFEFF' + header + '"Lee, Alex",10,,,Yes\n'), empty);
		expect(preview.rows[0]).toMatchObject({ studentName: 'Lee, Alex', actualGrade: 10, entries: { topical_individual: { selected: true }, knowdown: { selected: true }, project: { selected: false }, team_contest: { selected: false } } });
	});

	it('skips normalized name/grade duplicates and unreadable rows, preserving file row numbers', () => {
		const csv = header + ' ada   ALPHA ,12,1,,\nAda Alpha,11,,,\nAda Alpha,11,2,,\n,10,,,\nMissing grade,,,,\nBad grade,nine,,,\nBad team,10,abc,,\nBad knowdown,10,,,maybe\n\n"Lee, Alex",9,2,3,no\n';
		const preview = validateRegistrationCsv(parseRegistrationCsv(csv), { ...empty, students: [{ id: 'existing', name: 'Ada Alpha', actualGrade: 12 }] });
		expect(preview).toMatchObject({ newStudents: 2, duplicateRows: 2, skippedRows: 6 });
		expect(preview.rows.map(row => [row.studentName, row.actualGrade])).toEqual([['Ada Alpha', 11], ['Lee, Alex', 9]]);
		expect(preview.errors.map(error => error.rowNumber)).toContain(10);
		expect(() => parseRegistrationCsv(header + '"Unclosed,10,,,')).toThrow('unterminated');
	});

	it('appends invalid teams without changing existing students, and repeated uploads add nothing', { timeout: 20_000 }, async () => {
		const worker = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', compatibilityDate: '2026-03-10', d1Databases: ['DB'] });
		try {
			const d1 = await worker.getD1Database('DB');
			for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
				for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await d1.prepare(statement).run();
			}
			for (const statement of readFileSync('scripts/seed.sql', 'utf8').split(';').map(s => s.trim()).filter(Boolean)) await d1.prepare(statement).run();
			await d1.exec("UPDATE contests SET lifecycle = 'registration_open'; UPDATE seasons SET status = 'regional';");
			const db = getDb(d1 as unknown as D1Database);
			const scope = { contestId: 'contest-region-1', schoolId: 'school-alpha' };
			const before = (await d1.prepare('SELECT * FROM entry_members ORDER BY entry_id, annual_student_id').all()).results;
			const existing = await d1.prepare("SELECT name, actual_grade FROM annual_students WHERE school_id = 'school-alpha' LIMIT 1").first<{ name: string; actual_grade: number }>();
			const text = header + `${existing!.name},${existing!.actual_grade},99,99,yes\n` + Array.from({ length: 5 }, (_, i) => `New Student ${i},10,88,88,yes`).join('\n') + '\nNo Grade,,,,\n';
			const preview = await previewRegistrationCsv(db, scope.contestId, scope.schoolId, text);
			expect(preview).toMatchObject({ newStudents: 5, duplicateRows: 1, skippedRows: 1 });
			expect(await d1.prepare("SELECT COUNT(*) AS n FROM annual_students WHERE name LIKE 'New Student %'").first()).toEqual({ n: 0 });
			expect(await importRegistrationCsv(db, { ...scope, actorUserId: 'user-regional-coordinator', text })).toMatchObject({ newStudents: 5 });
			expect((await getRegistrationReadiness(db, scope.contestId)).find(s => s.schoolId === scope.schoolId)?.status).toBe('Needs attention');
			const memberships = (await d1.prepare('SELECT * FROM entry_members ORDER BY entry_id, annual_student_id').all()).results;
			for (const member of before) expect(memberships).toContainEqual(member);
			expect(await d1.prepare("SELECT category, COUNT(*) AS n FROM entries e JOIN entry_members m ON m.entry_id=e.id JOIN annual_students s ON s.id=m.annual_student_id WHERE s.name LIKE 'New Student %' GROUP BY category ORDER BY category").all()).toMatchObject({ results: [{ category: 'knowdown', n: 5 }, { category: 'team_contest', n: 5 }, { category: 'topical_team', n: 5 }] });
			expect(await importRegistrationCsv(db, { ...scope, actorUserId: 'user-regional-coordinator', text })).toMatchObject({ newStudents: 0, duplicateRows: 6 });
			await importRegistrationCsv(db, { ...scope, actorUserId: 'user-regional-coordinator', text: header + 'Solo Student,9,,,\nAnother Solo,11,,,\n' });
			expect(await d1.prepare("SELECT e.category, COUNT(DISTINCT e.id) AS n FROM entries e JOIN entry_members m ON m.entry_id=e.id JOIN annual_students s ON s.id=m.annual_student_id WHERE s.name IN ('Solo Student', 'Another Solo') GROUP BY e.category").all()).toMatchObject({ results: [{ category: 'topical_individual', n: 2 }] });
			await d1.exec("UPDATE contests SET lifecycle = 'roster_locked'");
			await expect(importRegistrationCsv(db, { ...scope, actorUserId: 'user-regional-coordinator', text })).rejects.toMatchObject({ code: 'locked' });
		} finally { await worker.dispose(); }
	});
});
