// Exercise the whole qualification lifecycle against disposable, real D1 storage.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';

const temp = mkdtempSync(join(tmpdir(), 'wsmc-qualification-check-'));
const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok"); } }', compatibilityDate: '2026-03-10', d1Databases: ['DB'] });
const vite = await createServer({ server: { middlewareMode: true } });
try {
	const sqlPath = join(temp, 'results.sql');
	execFileSync('node', ['scripts/generate-2026-results.mjs', sqlPath, join(temp, 'report.json')]);
	// SQLite's parser preserves trigger bodies and semicolons inside SQL literals.
	const statements = JSON.parse(execFileSync('python3', ['-c', `
import sqlite3,json,pathlib,sys,re
statements=[]
for path in [*sorted(pathlib.Path('drizzle').glob('*.sql')),pathlib.Path(sys.argv[1])]:
    buf=''
    for line in path.read_text().splitlines(True):
        buf+=line.replace('--> statement-breakpoint','')
        if sqlite3.complete_statement(buf):
            sql=re.sub(r'^--.*$', '', buf, flags=re.M).strip()
            if sql and not sql.startswith('PRAGMA foreign_keys'): statements.append(sql)
            buf=''
print(json.dumps(statements))
`, sqlPath], { encoding: 'utf8', maxBuffer: 10_000_000 }));
	const d1 = await mf.getD1Database('DB');
	for (const sql of statements) await d1.prepare(sql).run();
	const { getDb } = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	const { saveQualificationDraft, publishQualificationDraft, getQualificationWorkflow } = await vite.ssrLoadModule('/src/lib/server/qualification/workflow.ts');
	const { getQualificationPlanningData, recordManualQualificationDecision } = await vite.ssrLoadModule('/src/lib/server/qualification/cutoff-service.ts');
	const { setSeasonStatus } = await vite.ssrLoadModule('/src/lib/server/program/service.ts');
	const db = getDb(d1);
	const input = { seasonId: 'season-2026', actorUserId: 'user-coordinator', thresholds: JSON.parse((await getQualificationWorkflow(db, 'season-2026')).thresholdsJson) };
	const scalar = async sql => (await d1.prepare(sql).first()).n;
	const visibility = () => scalar("SELECT count(*) n FROM qualifications q JOIN qualification_rounds r ON r.id=q.round_id WHERE r.status='published'");
	const snapshot = async () => (await d1.prepare('SELECT q.id,q.entry_id,q.active,r.kind FROM qualifications q JOIN qualification_rounds r ON r.id=q.round_id ORDER BY q.id').all()).results;
	await assert.rejects(publishQualificationDraft(db, input), { code: 'not_saved' });
	await saveQualificationDraft(db, input);
	const planning = await getQualificationPlanningData(db, input.seasonId);
	assert(planning.members.every(member => typeof member.studentName === 'string' && member.studentName.length));
	// Saved review groups use the entry's original regional contest, not a
	// school's later assignment, and retain grades for Individual sections.
	const { getQualificationRoundReview } = await vite.ssrLoadModule('/src/lib/server/qualification/service.ts');
	const review = await getQualificationRoundReview(db, input.seasonId, 'regional_placements');
	const hanford = review.qualifications.filter(row => row.schoolName === 'Hanford');
	assert(hanford.length > 0);
	assert(hanford.every(row => row.regionNumber === 2));
	assert.equal(review.qualifications.find(row => row.schoolName === 'Oakesdale' && row.category === 'topical_team')?.score, 68);
	const virtual = review.qualifications.filter(row => row.regionNumber === 11);
	assert(virtual.length > 0);
	assert(virtual.every(row => row.regionName === 'Virtual'));
	assert(review.qualifications.filter(row => row.category === 'topical_individual').every(row => Number.isInteger(row.actualGrade) && row.actualGrade >= 9 && row.actualGrade <= 12));
	assert.equal(await scalar("SELECT count(*) n FROM qualifications q JOIN qualification_rounds r ON r.id=q.round_id WHERE r.kind='state_cutoff'"), 114);
	assert.equal(await scalar("SELECT count(*) n FROM qualifications q JOIN qualification_rounds r ON r.id=q.round_id WHERE r.kind='regional_placements' AND q.active=1"), 115);
	assert.equal(await visibility(), 0);
	await saveQualificationDraft(db, { ...input, thresholds: { project: 999, topical_individual: 999, team_contest: { 1: 999, 2: 999 }, topical_team: { 1: 999, 2: 999 } } });
	assert.equal(await scalar("SELECT count(*) n FROM qualifications q JOIN qualification_rounds r ON r.id=q.round_id WHERE r.kind='state_cutoff'"), 0);
	assert.equal(await scalar("SELECT count(*) n FROM (SELECT q.entry_id FROM qualifications q JOIN entries e ON e.id=q.entry_id JOIN qualification_reasons reason ON reason.qualification_id=q.id WHERE e.category='topical_individual' GROUP BY q.entry_id HAVING count(*) <> 1)"), 0);
	await d1.prepare("UPDATE contests SET lifecycle='scoring' WHERE id='contest-region-1'").run();
	await assert.rejects(publishQualificationDraft(db, input), { code: 'incomplete' });
	await d1.prepare("UPDATE contests SET lifecycle='finalized' WHERE id='contest-region-1'").run();
	const { previewStateCutoffs } = await vite.ssrLoadModule('/src/lib/qualification.ts');
	// Existing saved snapshots return to the editable workflow.
	await d1.prepare("UPDATE qualification_rounds SET status='frozen' WHERE status='draft'").run();
	assert.equal((await getQualificationWorkflow(db, input.seasonId)).status, 'draft');
	const excluded = planning.automaticEntryIds[0];
	const included = previewStateCutoffs(planning.rows, input.thresholds, new Set(planning.automaticEntryIds)).find(row => row.added).entryId;
	await recordManualQualificationDecision(db, { ...input, entryId: excluded, include: false, reason: 'Reviewed exclusion' });
	await recordManualQualificationDecision(db, { ...input, entryId: included, include: true, reason: 'Reviewed inclusion' });
	await assert.rejects(publishQualificationDraft(db, input), { code: 'unsaved_changes' });
	await saveQualificationDraft(db, input);
	assert.equal(await scalar("SELECT count(*) n FROM qualification_rounds WHERE status='frozen'"), 0);
	assert.equal((await d1.prepare('SELECT count(*) n FROM qualifications WHERE entry_id=? AND active=1').bind(excluded).first()).n, 0);
	assert.equal((await d1.prepare('SELECT count(*) n FROM qualifications WHERE entry_id=? AND active=1').bind(included).first()).n, 1);

	assert.equal((await getQualificationWorkflow(db, input.seasonId)).status, 'draft');
	assert.equal((await d1.prepare('SELECT status FROM seasons').first()).status, 'qualifications');
	assert.equal(await visibility(), 0);
	await assert.rejects(setSeasonStatus(db, input.seasonId, 'state'), { code: 'incomplete' });
	const saved = await snapshot();
	await publishQualificationDraft(db, input);
	assert.equal((await getQualificationWorkflow(db, input.seasonId)).status, 'published');
	assert.equal((await d1.prepare('SELECT status FROM seasons').first()).status, 'state');
	assert(saved.length > 0);
	assert.equal(await visibility(), saved.length); // Includes inactive Knowdown alternates, not just active qualifiers.
	assert.deepEqual(await snapshot(), saved); // Publish the saved snapshot without recalculation.
	await assert.rejects(saveQualificationDraft(db, input), { code: 'locked' });
	await assert.rejects(recordManualQualificationDecision(db, { ...input, entryId: excluded, include: true, reason: 'Cannot change a published list' }), { code: 'locked' });
	// Divisionless state entries inherit school metadata without requiring a
	// competitive division selection. Team events still reject a mismatch.
	const { createStateEntry } = await vite.ssrLoadModule('/src/lib/server/state/service.ts');
	const qualified = await d1.prepare("SELECT e.owner_school_id schoolId FROM qualifications q JOIN entries e ON e.id=q.entry_id WHERE q.active=1 AND e.division=2 AND e.owner_school_id IS NOT NULL LIMIT 1").first();
	await d1.prepare("UPDATE contests SET lifecycle='registration_open' WHERE id='contest-state-2026'").run();
	await d1.prepare("INSERT INTO school_participations (id,contest_id,school_id,division) VALUES ('state-division-check','contest-state-2026',?,2)").bind(qualified.schoolId).run();
	for (const category of ['project', 'topical_individual', 'knowdown']) {
		const id = await createStateEntry(db, { contestId: 'contest-state-2026', ownerSchoolId: qualified.schoolId, category, division: NaN, actorUserId: input.actorUserId });
		assert.equal((await d1.prepare('SELECT division FROM entries WHERE id=?').bind(id).first()).division, 2);
	}
	for (const category of ['team_contest', 'topical_team']) {
		await assert.rejects(createStateEntry(db, { contestId: 'contest-state-2026', ownerSchoolId: qualified.schoolId, category, division: 1, actorUserId: input.actorUserId }), { code: 'division_mismatch' });
	}
	// Newly published team qualifications must support registration without
	// pre-seeded berths or state participations, through the real coach action.
	const { getStateDashboard, addStateRosterMember, addStateEntryMember } = await vite.ssrLoadModule('/src/lib/server/state/service.ts');
	const { actions: stateActions } = await vite.ssrLoadModule('/src/routes/state/[contestId]/+page.server.ts');
	const dashboard = await getStateDashboard(db, 'contest-state-2026');
	const team = dashboard.teamBerths.find(item => item.berth.schoolId !== qualified.schoolId);
	assert(team, 'Published team qualification is available for state registration');
	const coach = await d1.prepare('SELECT user_id id FROM coach_assignments WHERE school_id=? LIMIT 1').bind(team.berth.schoolId).first();
	const coachEvent = schoolId => ({
		locals: { principal: { id: coach.id, isAdmin: false, coachAssignments: [{ schoolId }] } },
		platform: { env: { DB: d1 } }, params: { contestId: 'contest-state-2026' },
		request: new Request('http://localhost/state/contest-state-2026?/createTeam', { method: 'POST', body: new URLSearchParams({ berthId: team.berth.id }) }),
	});
	await assert.rejects(stateActions.createTeam(coachEvent(qualified.schoolId)), { status: 403 });
	assert.equal((await stateActions.createTeam(coachEvent(team.berth.schoolId))).success, 'State team entry created from the qualified berth.');
	const created = (await getStateDashboard(db, 'contest-state-2026')).teamBerths.find(item => item.berth.id === team.berth.id);
	assert(created.berth.stateEntryId);
	assert.equal((await stateActions.createTeam(coachEvent(team.berth.schoolId))).status, 400);
	const student = dashboard.students.find(student => student.schoolId === team.berth.schoolId);
	await addStateRosterMember(db, { contestId: dashboard.contest.id, schoolId: team.berth.schoolId, annualStudentId: student.id, admissionBasis: 'team_berth', stateEntryId: created.berth.stateEntryId, actorUserId: coach.id });
	await addStateEntryMember(db, { contestId: dashboard.contest.id, entryId: created.berth.stateEntryId, annualStudentId: student.id, competingGrade: student.actualGrade, actorUserId: coach.id });
	const registered = await getStateDashboard(db, dashboard.contest.id);
	assert(registered.roster.some(row => row.member.annualStudentId === student.id));
	assert(registered.members.some(row => row.member.entryId === created.berth.stateEntryId && row.student.id === student.id));
	// Coach worksheet starts with the qualified regional roster, not blank forms.
	const { getStateWorksheet, saveStateWorksheet } = await vite.ssrLoadModule('/src/lib/server/state/worksheet.ts');
	const sheet = await getStateWorksheet(db, 'contest-state-2026', 'r2-S1');
	const defaultsSheet = await getStateWorksheet(db, 'contest-state-2026', 'r5-S1');
	const individualOnly = defaultsSheet.options.find(option => option.studentId && !defaultsSheet.options.some(team => team.category === 'team_contest' && team.originalIds.includes(option.studentId)));
	assert(individualOnly, 'Fixture includes an individual qualifier without a qualified team');
	assert.equal(defaultsSheet.rows.find(row => row.id === individualOnly.studentId).events.team_contest, 'ad_hoc');
	assert(sheet.rows.some(row => row.attending && row.events.topical_team === 'ad_hoc'), 'Attendees without a topical event default to Ad Hoc');
	assert(sheet.rows.filter(row => row.events.topical_individual).every(row => !row.events.topical_team), 'Topical Individual keeps its own event slot');
	assert(sheet.rows.filter(row => !row.attending).every(row => !Object.values(row.events).includes('ad_hoc')), 'Absent students are not signed up');
	const source = sheet.options.find(o => o.team && o.originalIds.some(id => sheet.students.some(s => s.id === id && s.actualGrade < 12)));
	assert(source, 'Fixture has an original team member and room to play up');
	const original = sheet.students.find(s => source.originalIds.includes(s.id) && s.actualGrade < 12);
	assert.equal(sheet.rows.find(r => r.id === original.id).events[source.category], source.id);
	const substitute = sheet.students.find(s => !source.originalIds.includes(s.id));
	const proposed = structuredClone(sheet.rows).map(r => ({ ...r, attending: false, events: Object.fromEntries(Object.keys(r.events).map(c => [c, ''])) }));
	const replacement = proposed.find(r => r.id === substitute.id);
	replacement.attending = true; replacement.events[source.category] = source.id; replacement.grades[source.category] = 12;
	const save = rows => saveStateWorksheet(db, { contestId: 'contest-state-2026', schoolId: 'r2-S1', actorUserId: input.actorUserId, rows });
	await assert.rejects(save(proposed), { code: 'original_member_required' });
	assert.equal((await getStateWorksheet(db, 'contest-state-2026', 'r2-S1')).saved, false);
	const retained = proposed.find(r => r.id === original.id);
	retained.attending = true; retained.events[source.category] = source.id; retained.grades[source.category] = 12;
	await assert.rejects(save(proposed), { code: 'duplicate_grade' });
	retained.grades[source.category] = original.actualGrade;
	await save(proposed);
	const confirmed = await getStateWorksheet(db, 'contest-state-2026', 'r2-S1');
	assert.deepEqual(confirmed.rows, proposed);
	assert.equal((await d1.prepare("SELECT count(*) n FROM entry_members m JOIN entries e ON e.id=m.entry_id WHERE e.contest_id='contest-state-2026' AND e.owner_school_id='r2-S1'").first()).n, 2);
	// Withdrawing the whole team is valid; absent qualifiers stay absent on reload.
	proposed.forEach(row => row.attending = false);
	await save(proposed);
	assert((await getStateWorksheet(db, 'contest-state-2026', 'r2-S1')).rows.every(row => !row.attending));
	assert.equal((await d1.prepare("SELECT count(*) n FROM state_roster_members WHERE contest_id='contest-state-2026' AND school_id='r2-S1'").first()).n, 0);
	// Unknown substitutes and Ad Hoc signups save atomically with the worksheet.
	const newcomer = { id: crypto.randomUUID(), name: 'New State Substitute', actualGrade: 9 };
	const fresh = await getStateWorksheet(db, 'contest-state-2026', 'r2-S1');
	const pending = structuredClone(fresh.rows);
	const newRow = { id: newcomer.id, attending: true, events: Object.fromEntries(Object.keys(pending[0].events).map(key => [key, ''])), grades: Object.fromEntries(Object.keys(pending[0].grades).map(key => [key, 9])) };
	pending.push(newRow);
	const saveNew = () => saveStateWorksheet(db, { contestId: 'contest-state-2026', schoolId: 'r2-S1', actorUserId: input.actorUserId, rows: pending, newStudents: [newcomer] });
	await assert.rejects(saveNew(), { code: 'participation_required' });
	assert.equal(await d1.prepare('SELECT id FROM annual_students WHERE id=?').bind(newcomer.id).first(), null);
	newRow.events.team_contest = 'ad_hoc';
	await assert.rejects(saveNew(), { code: 'substitute_team_required' });
	assert.equal(await d1.prepare('SELECT id FROM annual_students WHERE id=?').bind(newcomer.id).first(), null);
	// A substitute is admitted by a qualified team, with one original retained.
	newRow.events.team_contest = ''; newRow.events[source.category] = source.id; newRow.grades[source.category] = 12;
	const keeper = pending.find(r => r.id === original.id);
	keeper.attending = true; keeper.events[source.category] = source.id; keeper.grades[source.category] = original.actualGrade;
	await saveNew();
	const reload = await getStateWorksheet(db, 'contest-state-2026', 'r2-S1');
	assert.equal(reload.students.find(s => s.id === newcomer.id).name, newcomer.name);
	assert.equal((await d1.prepare('SELECT admission_basis FROM state_roster_members WHERE annual_student_id=?').bind(newcomer.id).first()).admission_basis, 'team_berth');
	assert.equal((await d1.prepare("SELECT count(*) n FROM entry_members m JOIN entries e ON e.id=m.entry_id WHERE e.contest_id='contest-state-2026' AND m.annual_student_id=?").bind(newcomer.id).first()).n, 1);
	// Existing substitutes cannot switch to Ad Hoc alone on a later save either.
	const moved = structuredClone(reload.rows);
	const moving = moved.find(r => r.id === newcomer.id);
	moving.events[source.category] = ''; moving.events.team_contest = 'ad_hoc';
	await assert.rejects(save(moved), { code: 'substitute_team_required' });
	// A regional qualifier may choose Ad Hoc without competing on a qualified team.
	moving.attending = false;
	const qualifier = moved.find(r => r.id === original.id);
	qualifier.events[source.category] = ''; qualifier.events.team_contest = 'ad_hoc';
	await save(moved);
	assert.equal((await d1.prepare('SELECT school_id FROM state_ad_hoc_signups WHERE annual_student_id=?').bind(original.id).first()).school_id, 'r2-S1');
	assert.equal((await getStateWorksheet(db, 'contest-state-2026', 'r2-S1')).rows.find(r => r.id === original.id).events.team_contest, 'ad_hoc');
	// Both Ad Hoc events are independent signups, including for the same student.
	qualifier.events.topical_team = 'ad_hoc';
	await save(moved);
	assert.deepEqual((await d1.prepare('SELECT category FROM state_ad_hoc_signups WHERE annual_student_id=? ORDER BY category').bind(original.id).all()).results.map(row => row.category), ['team_contest', 'topical_team']);
	assert.equal((await getStateWorksheet(db, 'contest-state-2026', 'r2-S1')).rows.find(r => r.id === original.id).events.topical_team, 'ad_hoc');
	qualifier.events.team_contest = '';
	await save(moved);
	assert.deepEqual((await d1.prepare('SELECT category FROM state_ad_hoc_signups WHERE annual_student_id=?').bind(original.id).all()).results.map(row => row.category), ['topical_team']);
	moving.attending = true; moving.events.team_contest = ''; moving.events.topical_team = 'ad_hoc';
	await assert.rejects(save(moved), { code: 'substitute_team_required' });
	const { defaultStateAdHoc } = await vite.ssrLoadModule('/src/lib/state-registration.ts');
	moving.attending = false;
	qualifier.events.topical_team = ''; qualifier.adHocOptOuts = ['topical_team'];
	defaultStateAdHoc(qualifier, true);
	assert.equal(qualifier.events.topical_team, '', 'Explicit No event remains an opt-out');
	await save(moved);
	const optedOut = (await getStateWorksheet(db, 'contest-state-2026', 'r2-S1')).rows.find(row => row.id === original.id);
	optedOut.attending = false; defaultStateAdHoc(optedOut, true);
	optedOut.attending = true; defaultStateAdHoc(optedOut, true);
	assert.equal(optedOut.events.topical_team, '', 'Saved opt-outs survive attendance changes');
	assert.equal(optedOut.events.team_contest, 'ad_hoc', 'Free slots default when attendance resumes');
	assert.equal((await d1.prepare("SELECT count(*) n FROM state_ad_hoc_signups WHERE annual_student_id=? AND category='topical_team'").bind(original.id).first()).n, 0);
	// Topical Individual qualification reserves that track even after opting out.
	const topicalSheet = await getStateWorksheet(db, 'contest-state-2026', 'r5-S1');
	const individualQualifier = topicalSheet.options.find(option => option.category === 'topical_individual' && option.studentId);
	assert(individualQualifier);
	const topicalRows = structuredClone(topicalSheet.rows);
	topicalRows.forEach(row => row.attending = row.id === individualQualifier.studentId);
	const topicalRow = topicalRows.find(row => row.id === individualQualifier.studentId);
	topicalRow.events.topical_individual = ''; topicalRow.events.topical_team = 'ad_hoc';
	await assert.rejects(saveStateWorksheet(db, { contestId: 'contest-state-2026', schoolId: 'r5-S1', actorUserId: input.actorUserId, rows: topicalRows }), { code: 'individual_track_reserved' });
	topicalRow.events.topical_team = '';
	defaultStateAdHoc(topicalRow, true, true);
	assert.equal(topicalRow.events.topical_team, '', 'Opting out of Individual cannot default to a Topical Team');
	topicalRow.events.topical_individual = individualQualifier.id;
	await saveStateWorksheet(db, { contestId: 'contest-state-2026', schoolId: 'r5-S1', actorUserId: input.actorUserId, rows: topicalRows });
	assert.equal((await getStateWorksheet(db, 'contest-state-2026', 'r5-S1')).rows.find(row => row.id === individualQualifier.studentId).events.topical_individual, individualQualifier.id);
	const schoolTeam = topicalSheet.options.find(option => option.category === 'team_contest' && option.originalIds.some(id => id !== topicalRow.id));
	assert(schoolTeam);
	const teamKeeper = topicalRows.find(row => row.id !== topicalRow.id && schoolTeam.originalIds.includes(row.id));
	teamKeeper.attending = true; teamKeeper.events.team_contest = schoolTeam.id;
	topicalRow.events.team_contest = 'ad_hoc';
	await saveStateWorksheet(db, { contestId:'contest-state-2026', schoolId:'r5-S1', actorUserId:input.actorUserId, rows:topicalRows });
	// An undecided school can decline without first confirming a registration.
	const undecided = dashboard.qualifiedSchools.find(school => school.schoolId !== 'r2-S1' && school.schoolId !== 'r5-S1' && school.schoolId !== qualified.schoolId && school.schoolId !== team.berth.schoolId);
	assert(undecided);
	const { changeStateSchoolAttendance } = await vite.ssrLoadModule('/src/lib/server/state/worksheet.ts');
	const undecidedCoach = await d1.prepare('SELECT user_id id FROM coach_assignments WHERE school_id=? LIMIT 1').bind(undecided.schoolId).first();
	const undecidedPrincipal = { id:undecidedCoach.id, isAdmin:false, coachAssignments:[{schoolId:undecided.schoolId}] };
	assert.equal((await getStateWorksheet(db, 'contest-state-2026', undecided.schoolId)).saved, false);
	const changeUndecided = change => changeStateSchoolAttendance(db, { contestId:'contest-state-2026', schoolId:undecided.schoolId, change, principal:undecidedPrincipal });
	await changeUndecided('withdraw');
	const declined = await getStateWorksheet(db, 'contest-state-2026', undecided.schoolId);
	assert.equal(declined.withdrawn, true); assert.equal(declined.saved, false);
	assert.equal((await d1.prepare("SELECT intent FROM state_attendances WHERE contest_id='contest-state-2026' AND school_id=?").bind(undecided.schoolId).first()).intent, 'not_attending');
	await changeUndecided('resume');
	const reconsidered = await getStateWorksheet(db, 'contest-state-2026', undecided.schoolId);
	assert.equal(reconsidered.withdrawn, false); assert.equal(reconsidered.saved, false);
	assert.equal((await d1.prepare("SELECT intent FROM state_attendances WHERE contest_id='contest-state-2026' AND school_id=?").bind(undecided.schoolId).first()).intent, 'undecided');
	assert.equal((await d1.prepare("SELECT count(*) n FROM state_roster_members WHERE contest_id='contest-state-2026' AND school_id=?").bind(undecided.schoolId).first()).n, 0);
	assert.equal((await d1.prepare("SELECT count(*) n FROM state_ad_hoc_signups WHERE contest_id='contest-state-2026' AND school_id=?").bind(undecided.schoolId).first()).n, 0);
	// Whole-school withdrawal preserves plans and removes every active signup.
	const schoolCoach = await d1.prepare("SELECT u.id,u.email FROM users u JOIN coach_assignments a ON a.user_id=u.id WHERE a.school_id='r5-S1' LIMIT 1").first();
	const attendancePrincipal = { id: schoolCoach.id, email: schoolCoach.email, displayName: 'Coach', isAdmin: false, coachAssignments: [{ schoolId: 'r5-S1' }], regionalContestIds: [], scorekeeperContestIds: [] };
	const attendanceEvent = (change, principal = attendancePrincipal, confirmation = true) => ({
		locals: { principal }, platform: { env: { DB: d1 } }, params: { contestId: 'contest-state-2026' },
		request: new Request('http://localhost/state/contest-state-2026?/changeSchoolAttendance', { method: 'POST', body: new URLSearchParams({ schoolId: 'r5-S1', change, ...(confirmation ? { confirmWithdrawal: 'yes' } : {}) }) }),
	});
	const rawWorksheet = async () => (await d1.prepare("SELECT rows_json FROM state_worksheets WHERE contest_id='contest-state-2026' AND school_id='r5-S1'").first()).rows_json;
	const activeCounts = async () => Promise.all([
		scalar("SELECT count(*) n FROM entries WHERE contest_id='contest-state-2026' AND owner_school_id='r5-S1'"),
		scalar("SELECT count(*) n FROM state_roster_members WHERE contest_id='contest-state-2026' AND school_id='r5-S1'"),
		scalar("SELECT count(*) n FROM state_ad_hoc_signups WHERE contest_id='contest-state-2026' AND school_id='r5-S1'"),
	]);
	const beforeWithdrawal = await rawWorksheet();
	const beforeCounts = await activeCounts();
	assert(beforeCounts.every(count => count > 0));
	const otherSchoolCount = await scalar("SELECT count(*) n FROM state_roster_members WHERE school_id='r2-S1'");
	await assert.rejects(stateActions.changeSchoolAttendance(attendanceEvent('withdraw', { ...attendancePrincipal, coachAssignments: [{schoolId:'r2-S1'}] })), { status:403 });
	assert.equal((await stateActions.changeSchoolAttendance(attendanceEvent('withdraw', attendancePrincipal, false))).status, 400);
	assert.equal((await getStateWorksheet(db, 'contest-state-2026', 'r5-S1')).withdrawn, false);
	assert((await stateActions.changeSchoolAttendance(attendanceEvent('withdraw'))).success);
	assert.equal((await getStateWorksheet(db, 'contest-state-2026', 'r5-S1')).withdrawn, true);
	assert.equal(await rawWorksheet(), beforeWithdrawal);
	assert.deepEqual(await activeCounts(), [0,0,0]);
	assert.equal(await scalar("SELECT count(*) n FROM state_roster_members WHERE school_id='r2-S1'"), otherSchoolCount);
	assert.equal((await d1.prepare("SELECT intent FROM state_attendances WHERE contest_id='contest-state-2026' AND school_id='r5-S1'").first()).intent, 'not_attending');
	await assert.rejects(saveStateWorksheet(db, { contestId:'contest-state-2026', schoolId:'r5-S1', rows:topicalRows, actorUserId:schoolCoach.id }), { code:'withdrawn' });
	const { setStateAttendance } = await vite.ssrLoadModule('/src/lib/server/state/service.ts');
	await assert.rejects(setStateAttendance(db, { contestId:'contest-state-2026', schoolId:'r5-S1', intent:'attending', actorUserId:schoolCoach.id }), { code:'withdrawn' });
	assert((await stateActions.changeSchoolAttendance(attendanceEvent('resume'))).success);
	assert.equal((await getStateWorksheet(db, 'contest-state-2026', 'r5-S1')).withdrawn, false);
	assert.equal(await rawWorksheet(), beforeWithdrawal);
	assert.deepEqual(await activeCounts(), beforeCounts);
	assert((await getStateWorksheet(db, 'contest-state-2026', 'r5-S1')).options.find(option => option.id === schoolTeam.id).berth.stateEntryId);
	// Locking transfers school-level attendance changes to administrators only.
	await d1.prepare("UPDATE contests SET lifecycle='roster_locked' WHERE id='contest-state-2026'").run();
	assert.equal((await stateActions.changeSchoolAttendance(attendanceEvent('withdraw'))).status, 400);
	const adminPrincipal = { ...attendancePrincipal, id:input.actorUserId, isAdmin:true, coachAssignments:[] };
	assert((await stateActions.changeSchoolAttendance(attendanceEvent('withdraw', adminPrincipal))).success);
	assert.equal((await stateActions.changeSchoolAttendance(attendanceEvent('resume'))).status, 400);
	assert((await stateActions.changeSchoolAttendance(attendanceEvent('resume', adminPrincipal))).success);
	assert.deepEqual(await activeCounts(), beforeCounts);
	assert.equal((await d1.prepare("SELECT lifecycle FROM contests WHERE id='contest-state-2026'").first()).lifecycle, 'roster_locked');
	await d1.prepare("UPDATE contests SET lifecycle='scoring' WHERE id='contest-state-2026'").run();
	assert.equal((await stateActions.changeSchoolAttendance(attendanceEvent('withdraw', adminPrincipal))).status, 400);
	assert.deepEqual(await activeCounts(), beforeCounts);
	console.log('Qualification D1 workflow passed: persisted defaults, named members, combined draft, replacement, finalization gate, legacy frozen draft editing, unsaved exception gate, hidden-before-publication, immutable publication, state transition.');
} finally {
	await vite.close(); await mf.dispose(); rmSync(temp, { recursive: true, force: true });
}
