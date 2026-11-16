import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from '$lib/server/db';
import { actions as contestActions, load as loadOverview } from '../../../routes/contests/[contestId]/+page.server';
import { getRegistrationReadiness } from './readiness';
import { saveContestWorksheet } from './service';
import { reopenContest } from '$lib/server/scoring/service';
import { actions, load } from '../../../routes/registration/[contestId]/[schoolId]/+page.server';
import type { Principal } from '$lib/server/auth/capabilities';

const workers: Miniflare[] = [];
afterEach(async () => { await Promise.all(workers.splice(0).map(worker => worker.dispose())); });
const principal: Principal = { id: 'user-regional-coordinator', email: '', displayName: '', isAdmin: false, regionalContestIds: ['contest-region-1'], coachAssignments: [], scorekeeperContestIds: [] };
const scope = { contestId: 'contest-region-1', schoolId: 'school-alpha' };
function student(studentId: string, team: number | null, topical = 'individual', knowdown = false) {
	return { studentId, attending: true, team, teamGrade: null, topical, topicalGrade: null, project: null, projectGrade: null, knowdown };
}
const students = () => [student('student-alpha-10', 1, 'individual', true), student('student-alpha-11', 2), student('student-alpha-12', 1, 'individual', true)];
async function fixture() {
	const worker = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', compatibilityDate: '2026-03-10', d1Databases: ['DB'] });
	workers.push(worker);
	const d1 = await worker.getD1Database('DB');
	for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
		for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await d1.prepare(statement).run();
	}
	for (const statement of readFileSync('scripts/seed.sql', 'utf8').split(';').map(s => s.trim()).filter(Boolean)) await d1.prepare(statement).run();
	await d1.exec('DELETE FROM state_roster_members; DELETE FROM state_team_berths; DELETE FROM qualifications; DELETE FROM qualification_rounds; DELETE FROM results;');
	await d1.prepare("UPDATE seasons SET status = 'regional'").run();
	await d1.prepare("UPDATE contests SET lifecycle = 'registration_open'").run();
	const db = getDb(d1 as unknown as D1Database);
	await saveContestWorksheet(db, { ...scope, students: students() });
	const event = (actor: Principal = principal, data = new FormData()) => ({ locals: { principal: actor }, platform: { env: { DB: d1 } }, params: scope, request: new Request('https://wsmc.example', { method: 'POST', body: data }) }) as never;
	return { db, d1, event };
}

// Real D1 startup, seeding and multi-stage journeys need more than 5s on CI.
describe('contest-day registration corrections', { timeout: 15_000 }, () => {
	it('writes only changed regional memberships and leaves unchanged saves at the same scoring revision', async () => {
		const { db, d1 } = await fixture();
		// Observe actual storage writes, including redundant replacements with identical values.
		await d1.exec('CREATE TABLE membership_writes (operation TEXT, entry_id TEXT, student_id TEXT, grade INTEGER)');
		for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
			const row = operation === 'DELETE' ? 'OLD' : 'NEW';
			await d1.prepare(`CREATE TRIGGER record_membership_${operation} AFTER ${operation} ON entry_members BEGIN INSERT INTO membership_writes VALUES ('${operation}', ${row}.entry_id, ${row}.annual_student_id, ${row}.competing_grade); END`).run();
		}
		const revision = () => d1.prepare('SELECT scoring_revision FROM contests WHERE id = ?').bind(scope.contestId).first('scoring_revision');
		const writes = async () => (await d1.prepare('SELECT * FROM membership_writes ORDER BY operation, entry_id, student_id').all()).results;
		const before = await revision();
		await saveContestWorksheet(db, { ...scope, students: students().reverse() });
		expect(await writes()).toEqual([]);
		expect(await revision()).toBe(before);

		const teamId = async (number: number) => String((await d1.prepare("SELECT id FROM entries WHERE contest_id = ? AND owner_school_id = ? AND category = 'team_contest' AND entry_number = ?").bind(scope.contestId, scope.schoolId, number).first())!.id);
		const firstTeam = await teamId(1), secondTeam = await teamId(2);
		const changed = students().map(row => ({ ...row, teamGrade: row.studentId === 'student-alpha-10' ? 11 : null }));
		changed[2].team = 2;
		await saveContestWorksheet(db, { ...scope, students: changed });
		expect(await writes()).toEqual([
			{ operation: 'DELETE', entry_id: firstTeam, student_id: 'student-alpha-12', grade: 12 },
			{ operation: 'INSERT', entry_id: secondTeam, student_id: 'student-alpha-12', grade: 12 },
			{ operation: 'UPDATE', entry_id: firstTeam, student_id: 'student-alpha-10', grade: 11 },
		]);
		expect((await d1.prepare("SELECT entry_id, annual_student_id, competing_grade FROM entry_members WHERE entry_id IN (?, ?) ORDER BY annual_student_id").bind(firstTeam, secondTeam).all()).results).toEqual([
			{ entry_id: firstTeam, annual_student_id: 'student-alpha-10', competing_grade: 11 },
			{ entry_id: secondTeam, annual_student_id: 'student-alpha-11', competing_grade: 11 },
			{ entry_id: secondTeam, annual_student_id: 'student-alpha-12', competing_grade: 12 },
		]);
	});

	it('keeps school roster loads and replacements isolated from other participating schools', async () => {
		const { d1, event } = await fixture();
		const coach = { ...principal, id: 'user-coach-alpha-1', regionalContestIds: [], coachAssignments: [{ schoolId: scope.schoolId }] };
		const schoolRoster = await load(event(coach)) as any;
		expect(schoolRoster.rosterIds.sort()).toEqual(students().map(row => row.studentId).sort());
		expect(schoolRoster.readiness.rosterCount).toBe(3);
		// Beta already has category entries: those must not block Alpha's save.
		const data = new FormData();
		for (const row of students()) data.append('studentIds', row.studentId);
		expect(await actions.saveRoster!(event(coach, data))).toMatchObject({ success: expect.any(String) });
		await d1.prepare("INSERT INTO annual_students (id, season_id, school_id, name, actual_grade) VALUES ('alpha-unassigned', 'season-2026', 'school-alpha', 'Alpha Unassigned', 9), ('beta-unassigned', 'season-2026', 'school-beta', 'Beta Unassigned', 9)").run();
		await d1.prepare("INSERT INTO contest_roster_members (contest_id, participation_id, annual_student_id) VALUES ('contest-region-1', 'participation-r1-alpha', 'alpha-unassigned'), ('contest-region-1', 'participation-r1-beta', 'beta-unassigned')").run();
		const betaBefore = (await d1.prepare("SELECT * FROM contest_roster_members WHERE participation_id = 'participation-r1-beta' ORDER BY annual_student_id").all()).results;
		expect(await actions.saveRoster!(event(coach, data))).toMatchObject({ success: 'Roster saved: 0 added, 1 removed.' });
		expect(await d1.prepare("SELECT * FROM contest_roster_members WHERE annual_student_id = 'alpha-unassigned'").first()).toBeNull();
		expect((await d1.prepare("SELECT * FROM contest_roster_members WHERE participation_id = 'participation-r1-beta' ORDER BY annual_student_id").all()).results).toEqual(betaBefore);
	});

	it('saves the regional Knowdown limit with the date and enforces it through registration and finalization', async () => {
		const { db, d1, event } = await fixture();
		await d1.prepare("INSERT INTO annual_students (id, season_id, school_id, name, actual_grade) VALUES ('fourth', 'season-2026', 'school-alpha', 'Fourth Student', 9)").run();
		const rows = [...students().map(row => ({ ...row, knowdown: true })), student('fourth', null, 'individual', true)];
		await expect(saveContestWorksheet(db, { ...scope, students: rows })).rejects.toMatchObject({ code: 'knowdown_limit' });
		await d1.prepare('UPDATE contests SET starts_at = NULL WHERE id = ?').bind(scope.contestId).run();
		const data = new FormData();
		data.set('startsAt', '2026-03-12'); data.set('knowdownLimit', '5');
		expect(await contestActions.updateDate!(event(principal, data))).toMatchObject({ success: expect.any(String) });
		expect(await d1.prepare('SELECT knowdown_limit, starts_at FROM contests WHERE id = ?').bind(scope.contestId).first()).toMatchObject({ knowdown_limit: 5, starts_at: Date.parse('2026-03-12') });
		await saveContestWorksheet(db, { ...scope, students: rows });
		expect((await getRegistrationReadiness(db, scope.contestId)).find(s => s.schoolId === scope.schoolId)?.status).toBe('Valid');
		data.set('knowdownLimit', '2.5');
		expect(await contestActions.updateDate!(event(principal, data))).toMatchObject({ status: 400 });
		await d1.prepare("UPDATE contests SET lifecycle = 'finalized' WHERE id = ?").bind(scope.contestId).run();
		data.set('knowdownLimit', '6');
		expect(await contestActions.updateDate!(event(principal, data))).toMatchObject({ status: 400 });
		expect(await d1.prepare('SELECT knowdown_limit FROM contests WHERE id = ?').bind(scope.contestId).first()).toMatchObject({ knowdown_limit: 5 });
	});

	it('requires only the Knowdown leaderboard in overview coverage, including small and empty fields', async () => {
		const { d1, event } = await fixture();
		const coverage = async () => {
			const overview = await loadOverview(event()) as any;
			return overview.categoryCoverage.find((row: any) => row.category === 'knowdown');
		};
		const ids = (await d1.prepare("SELECT id FROM entries WHERE contest_id = ? AND category = 'knowdown' ORDER BY id").bind(scope.contestId).all()).results.map(row => String(row.id));
		expect(ids.length).toBeGreaterThan(4);
		expect(await coverage()).toMatchObject({ total: ids.length, complete: 0, missing: 4 });
		for (const [index, id] of ids.entries()) await d1.prepare('INSERT INTO results (entry_id, placement, knowdown_outcome) VALUES (?, ?, ?)').bind(id, index < 4 ? index + 1 : null, index < 4 ? 'placed' : 'eliminated').run();
		expect(await coverage()).toMatchObject({ complete: 4, missing: 0 });
		for (const id of ids.slice(2)) await d1.prepare('DELETE FROM entries WHERE id = ?').bind(id).run();
		expect(await coverage()).toMatchObject({ total: 2, complete: 2, missing: 0 });
		await d1.prepare('DELETE FROM results WHERE entry_id = ?').bind(ids[0]).run();
		expect(await coverage()).toMatchObject({ missing: 1 });
		for (const id of ids.slice(0, 2)) await d1.prepare('DELETE FROM entries WHERE id = ?').bind(id).run();
		expect(await coverage()).toMatchObject({ total: 0, complete: 0, missing: 0 });
	});

	it('keeps team scores with teams and individual scores with students when the worksheet changes order and membership', async () => {
		const { d1, event } = await fixture();
		const entries = (await d1.prepare("SELECT e.id, e.category, e.entry_number, m.annual_student_id FROM entries e JOIN entry_members m ON m.entry_id = e.id WHERE e.contest_id = ? AND e.owner_school_id = ?").bind(scope.contestId, scope.schoolId).all()).results;
		const team = entries.find(e => e.category === 'team_contest' && e.entry_number === 1)!;
		const knowdown = entries.find(e => e.category === 'knowdown' && e.annual_student_id === 'student-alpha-12')!;
		await d1.prepare("INSERT INTO results (entry_id, placement, knowdown_outcome) VALUES (?, 1, 'placed')").bind(knowdown.id).run();
		const individual = entries.find(e => e.category === 'topical_individual' && e.annual_student_id === 'student-alpha-10')!;
		await d1.prepare('INSERT INTO results (entry_id, score) VALUES (?, 0), (?, 45)').bind(team.id, individual.id).run();
		await d1.prepare("UPDATE contests SET lifecycle = 'scoring' WHERE id = ?").bind(scope.contestId).run();
		const changed = students().reverse();
		changed.find(s => s.studentId === 'student-alpha-12')!.team = 2;
		changed.find(s => s.studentId === 'student-alpha-10')!.knowdown = false;
		changed.find(s => s.studentId === 'student-alpha-11')!.knowdown = true;
		const data = new FormData();
		for (const row of changed) {
			data.append('studentId', row.studentId);
			data.set(`attending_${row.studentId}`, 'yes');
			data.set(`team_${row.studentId}`, String(row.team));
			data.set(`topical_${row.studentId}`, row.topical);
			if (row.knowdown) data.set(`knowdown_${row.studentId}`, 'on');
		}
		expect(await actions.saveWorksheet(event(principal, data))).toMatchObject({ success: expect.any(String) });
		expect(await d1.prepare('SELECT placement FROM results WHERE entry_id = ?').bind(knowdown.id).first()).toMatchObject({ placement: 1 });
		expect(await d1.prepare("SELECT r.placement FROM entries e JOIN entry_members m ON m.entry_id = e.id LEFT JOIN results r ON r.entry_id = e.id WHERE e.category = 'knowdown' AND e.contest_id = ? AND m.annual_student_id = 'student-alpha-11'").bind(scope.contestId).first()).toMatchObject({ placement: null });
		expect(await d1.prepare('SELECT score FROM results WHERE entry_id = ?').bind(team.id).first()).toMatchObject({ score: 0 });
		expect(await d1.prepare('SELECT score FROM results WHERE entry_id = ?').bind(individual.id).first()).toMatchObject({ score: 45 });
		expect((await d1.prepare('SELECT annual_student_id FROM entry_members WHERE entry_id = ?').bind(team.id).all()).results).toEqual([{ annual_student_id: 'student-alpha-10' }]);
		expect(await d1.prepare('SELECT annual_student_id FROM entry_members WHERE entry_id = ?').bind(individual.id).first()).toMatchObject({ annual_student_id: 'student-alpha-10' });
		expect(await d1.prepare("SELECT actor_user_id FROM audit_events WHERE action = 'registration_corrected'").first()).toMatchObject({ actor_user_id: principal.id });
	});

	it('requires confirmation of the exact scored removal and preserves everything on rejection', async () => {
		const { db, d1 } = await fixture();
		const entry = (await d1.prepare("SELECT id FROM entries WHERE contest_id = ? AND owner_school_id = ? AND category = 'topical_individual' AND id IN (SELECT entry_id FROM entry_members WHERE annual_student_id = 'student-alpha-10')").bind(scope.contestId, scope.schoolId).first())!;
		await d1.prepare('INSERT INTO results (entry_id, part1) VALUES (?, 0)').bind(entry.id).run();
		await d1.prepare("UPDATE contests SET lifecycle = 'scoring' WHERE id = ?").bind(scope.contestId).run();
		const changed = students(); changed[0].topical = '';
		await expect(saveContestWorksheet(db, { ...scope, principal, students: changed })).rejects.toMatchObject({ code: 'scored_removal', removals: [expect.objectContaining({ entryId: entry.id, result: expect.objectContaining({ part1: 0 }) })] });
		expect(await d1.prepare('SELECT part1 FROM results WHERE entry_id = ?').bind(entry.id).first()).toMatchObject({ part1: 0 });
		let confirmation = '';
		try { await saveContestWorksheet(db, { ...scope, principal, students: changed }); } catch (cause) { confirmation = (cause as { confirmation: string }).confirmation; }
		await d1.prepare('UPDATE results SET part2 = 12, version = version + 1 WHERE entry_id = ?').bind(entry.id).run();
		await expect(saveContestWorksheet(db, { ...scope, principal, students: changed, removalConfirmation: confirmation })).rejects.toMatchObject({ code: 'scored_removal' });
		try { await saveContestWorksheet(db, { ...scope, principal, students: changed }); } catch (cause) { confirmation = (cause as { confirmation: string }).confirmation; }
		await saveContestWorksheet(db, { ...scope, principal, students: changed, removalConfirmation: confirmation });
		expect(await d1.prepare('SELECT * FROM results WHERE entry_id = ?').bind(entry.id).first()).toBeNull();
	});

	it('protects published qualifications for this regional without blocking a different regional', async () => {
		const { d1, event } = await fixture();
		await d1.prepare("UPDATE contests SET lifecycle = 'scoring' WHERE id = ?").bind(scope.contestId).run();
		await d1.prepare("INSERT INTO qualification_rounds (id, season_id, kind, status, created_by) VALUES ('published', 'season-2026', 'regional_placements', 'published', ?)").bind(principal.id).run();
		await d1.prepare("INSERT INTO qualifications (id, round_id, season_id, entry_id) SELECT 'published-entry', 'published', 'season-2026', id FROM entries WHERE contest_id = ? LIMIT 1").bind(scope.contestId).run();
		expect(await load(event())).toMatchObject({ readOnly: true, lockReason: expect.stringContaining('Qualifications') });
		await expect(actions.addStudent(event())).rejects.toMatchObject({ status: 409 });
		const other = { ...event() as object, params: { contestId: 'contest-region-2', schoolId: 'school-gamma' }, locals: { principal: { ...principal, regionalContestIds: ['contest-region-2'] } } };
		expect(await load(other as never)).toMatchObject({ readOnly: false });
	});

	it('allows only the assigned coordinator to edit locked/scoring registrations and keeps finalized/archived read-only', async () => {
		const { db, d1, event } = await fixture();
		const coach = { ...principal, id: 'user-coach-alpha-1', regionalContestIds: [], coachAssignments: [{ schoolId: scope.schoolId }] };
		for (const lifecycle of ['roster_locked', 'scoring']) {
			await d1.prepare('UPDATE contests SET lifecycle = ? WHERE id = ?').bind(lifecycle, scope.contestId).run();
			expect(await load(event())).toMatchObject({ readOnly: false });
			expect(await load(event(coach))).toMatchObject({ readOnly: true });
			await expect(actions.addStudent(event({ ...principal, regionalContestIds: ['contest-region-2'] }))).rejects.toMatchObject({ status: 403 });
			await expect(actions.addStudent(event({ ...principal, regionalContestIds: [], scorekeeperContestIds: [scope.contestId] }))).rejects.toMatchObject({ status: 403 });
			await expect(saveContestWorksheet(db, { ...scope, principal: coach, students: students() })).rejects.toMatchObject({ code: 'locked' });
			const data = new FormData(); data.set('name', 'Late arrival'); data.set('actualGrade', '9');
			await expect(actions.addStudent(event(coach, data))).rejects.toMatchObject({ status: 409 });
			expect(await actions.addStudent(event(principal, data))).toMatchObject({ success: expect.any(String) });
		}
		await d1.prepare("UPDATE contests SET lifecycle = 'finalized' WHERE id = ?").bind(scope.contestId).run();
		expect(await load(event())).toMatchObject({ readOnly: true });
		await expect(actions.addStudent(event())).rejects.toMatchObject({ status: 409 });
		await reopenContest(db, { contestId: scope.contestId, actorUserId: principal.id, reason: 'Correct actual participants' });
		expect(await load(event())).toMatchObject({ readOnly: false, contest: { lifecycle: 'scoring', resultsPublishedAt: null } });
		await d1.prepare("INSERT INTO qualification_rounds (id, season_id, kind, status, created_by) VALUES ('frozen', 'season-2026', 'state_cutoff', 'frozen', ?)").bind(principal.id).run();
		expect(await load(event())).toMatchObject({ readOnly: false });
		await d1.prepare("UPDATE qualification_rounds SET status='published' WHERE id='frozen'").run();
		expect(await load(event())).toMatchObject({ readOnly: true });
		await expect(actions.addStudent(event())).rejects.toMatchObject({ status: 409 });
		await d1.prepare("UPDATE seasons SET status = 'archived'").run();
		expect(await load(event())).toMatchObject({ readOnly: true });
		await expect(actions.updateStudent(event())).rejects.toMatchObject({ status: 409 });
	});
});
