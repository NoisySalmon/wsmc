// Public integration journey: real D1 storage, fictional showcase students/results.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';

const temp = mkdtempSync(join(tmpdir(), 'wsmc-workflow-check-'));
const mf = new Miniflare({ modules:true, script:'export default { fetch() { return new Response("ok"); } }', compatibilityDate:'2026-03-10', d1Databases:['DB'] });
const vite = await createServer({ server:{ middlewareMode:true } });
try {
 const sqlPath = join(temp, 'synthetic.sql');
 execFileSync('node', ['scripts/generate-showcase.mjs', sqlPath]);
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
 const { saveQualificationDraft, publishQualificationDraft } = await vite.ssrLoadModule('/src/lib/server/qualification/workflow.ts');
 const { recordManualQualificationDecision } = await vite.ssrLoadModule('/src/lib/server/qualification/cutoff-service.ts');
 const { getStateDashboard, setStateAttendance } = await vite.ssrLoadModule('/src/lib/server/state/service.ts');
 const { getStateWorksheet, saveStateWorksheet } = await vite.ssrLoadModule('/src/lib/server/state/worksheet.ts');
 const { actions } = await vite.ssrLoadModule('/src/routes/state/[contestId]/+page.server.ts');
 const { defaultStateAdHoc } = await vite.ssrLoadModule('/src/lib/state-registration.ts');
 const db = getDb(d1);
 const first = (sql, ...args) => d1.prepare(sql).bind(...args).first();
 const count = async (sql, ...args) => (await first(sql, ...args)).n;
 const stateId = (await first("SELECT id FROM contests WHERE kind='state'")).id;
 const input = { seasonId:'season-2026', actorUserId:'user-coordinator', thresholds:{ project:0, team_contest:{1:0,2:0}, topical_team:{1:0,2:0}, topical_individual:0 } };
 await d1.prepare("UPDATE seasons SET status='qualifications'").run();
 await d1.prepare("UPDATE contests SET lifecycle='finalized' WHERE kind='regional'").run();
 await assert.rejects(publishQualificationDraft(db, input), {code:'not_saved'});
 await saveQualificationDraft(db, input);
 const cutoffCount = () => count("SELECT count(*) n FROM qualifications q JOIN qualification_rounds r ON r.id=q.round_id WHERE r.kind='state_cutoff'");
 assert(await cutoffCount() > 0);
 await saveQualificationDraft(db, {...input, thresholds:{ project:9999, team_contest:{1:9999,2:9999}, topical_team:{1:9999,2:9999}, topical_individual:9999 }});
 assert.equal(await cutoffCount(), 0);
 await saveQualificationDraft(db, input);
 const excluded = await first("SELECT entry_id id FROM qualifications WHERE active=1 LIMIT 1");
 await recordManualQualificationDecision(db, {...input, entryId:excluded.id, include:false, reason:'Synthetic review exclusion'});
 await assert.rejects(publishQualificationDraft(db, input), {code:'unsaved_changes'});
 await saveQualificationDraft(db, input);
 assert.equal(await count('SELECT count(*) n FROM qualifications WHERE entry_id=? AND active=1', excluded.id), 0);
 const regional = await first("SELECT id FROM contests WHERE kind='regional' LIMIT 1");
 await d1.prepare("UPDATE contests SET lifecycle='scoring' WHERE id=?").bind(regional.id).run();
 await assert.rejects(publishQualificationDraft(db, input), {code:'incomplete'});
 await d1.prepare("UPDATE contests SET lifecycle='finalized' WHERE id=?").bind(regional.id).run();
 const snapshot = async () => (await d1.prepare('SELECT id,entry_id,active FROM qualifications ORDER BY id').all()).results;
 const before = await snapshot();
 await publishQualificationDraft(db, input);
 assert.deepEqual(await snapshot(), before);
 assert.equal((await first('SELECT status FROM seasons')).status, 'state');
 assert.equal((await first('SELECT lifecycle FROM contests WHERE id=?', stateId)).lifecycle, 'registration_open');
 await assert.rejects(saveQualificationDraft(db, input), {code:'locked'});

 const dashboard = await getStateDashboard(db, stateId);
 assert(dashboard.qualifiedSchools.length > 1);
 assert(dashboard.qualifiedSchools.every(school => Number.isInteger(school.regionNumber)));
 // Find a fictional fixture with both team and individual qualifications.
 let sheet;
 for (const school of dashboard.qualifiedSchools) {
  const candidate = await getStateWorksheet(db, stateId, school.schoolId);
  if (candidate.options.some(o => o.category==='topical_individual' && o.studentId) && candidate.options.some(o => o.category==='team_contest' && o.originalIds.some(id => candidate.students.find(s => s.id===id)?.actualGrade<12))) {sheet=candidate;break;}
 }
 assert(sheet);
 const schoolId = sheet.school.schoolId;
 const team = sheet.options.find(o => o.category==='team_contest' && o.originalIds.some(id => sheet.students.find(s => s.id===id)?.actualGrade<12));
 const original = sheet.students.find(s => team.originalIds.includes(s.id) && s.actualGrade<12);
 const individual = sheet.options.find(o => o.category==='topical_individual' && o.studentId);
 assert(sheet.rows.filter(r => r.attending && !r.events.topical_individual && !r.events.topical_team).length===0);
 assert(sheet.rows.filter(r => r.events.topical_individual).every(r => !r.events.topical_team));
 const coachUser = await first('SELECT user_id id FROM coach_assignments WHERE school_id=? LIMIT 1', schoolId);
 const coach = {id:coachUser.id, isAdmin:false, coachAssignments:[{schoolId}], regionalContestIds:[],scorekeeperContestIds:[]};
 const admin = {...coach,id:input.actorUserId,isAdmin:true,coachAssignments:[]};
 const attendance = (change, principal=coach, confirmed=true, target=schoolId) => actions.changeSchoolAttendance({
  locals:{principal}, platform:{env:{DB:d1}}, params:{contestId:stateId},
  request:new Request('http://localhost/state/test?/changeSchoolAttendance', {method:'POST',body:new URLSearchParams({schoolId:target,change,...(confirmed?{confirmWithdrawal:'yes'}:{})})}),
 });
 const save = (rows, newStudents=[]) => saveStateWorksheet(db, {contestId:stateId,schoolId,actorUserId:coach.id,rows,newStudents});
 const rows = structuredClone(sheet.rows).map(row => ({...row,attending:false,events:Object.fromEntries(Object.keys(row.events).map(event=>[event,'']))}));
 const substitute = {id:crypto.randomUUID(),name:'Fictional Substitute',actualGrade:9};
 const replacement = {id:substitute.id,attending:true,events:{team_contest:'',topical_team:'',topical_individual:'',project:'',knowdown:''},grades:{team_contest:12,topical_team:9,topical_individual:9,project:9,knowdown:9}};
 rows.push(replacement);
 await assert.rejects(save(rows,[substitute]), {code:'participation_required'});
 replacement.events.team_contest='ad_hoc';
 await assert.rejects(save(rows,[substitute]), {code:'substitute_team_required'});
 assert.equal(await first('SELECT id FROM annual_students WHERE id=?',substitute.id),null);
 replacement.events.team_contest=team.id;
 await assert.rejects(save(rows,[substitute]), {code:'original_member_required'});
 const keeper=rows.find(r=>r.id===original.id);
 keeper.attending=true;keeper.events.team_contest=team.id;keeper.grades.team_contest=12;
 await assert.rejects(save(rows,[substitute]), {code:'duplicate_grade'});
 keeper.grades.team_contest=original.actualGrade;
 defaultStateAdHoc(keeper,true,sheet.options.some(o=>o.category==='topical_individual' && o.studentId===keeper.id));
 defaultStateAdHoc(replacement,true);
 await save(rows,[substitute]);
 assert.equal((await getStateWorksheet(db,stateId,schoolId)).students.find(s=>s.id===substitute.id).name,substitute.name);
 assert.equal((await first('SELECT admission_basis FROM state_roster_members WHERE annual_student_id=?',substitute.id)).admission_basis,'team_berth');
 const reserved=rows.find(r=>r.id===individual.studentId);
 const reservedBefore=structuredClone(reserved);
 reserved.attending=true;reserved.events.topical_individual='';reserved.events.topical_team='ad_hoc';
 await assert.rejects(save(rows),{code:'individual_track_reserved'});
 Object.assign(reserved,reservedBefore);
 replacement.events.topical_team='';replacement.adHocOptOuts=['topical_team'];
 defaultStateAdHoc(replacement,true);
 assert.equal(replacement.events.topical_team,'');
 const poolRow=rows.find(row=>row.id!==keeper.id && sheet.options.some(o=>o.category==='topical_team' && o.originalIds.includes(row.id)) && !sheet.options.some(o=>o.category==='topical_individual' && o.studentId===row.id));
 assert(poolRow);poolRow.attending=true;poolRow.events.team_contest='ad_hoc';poolRow.events.topical_team='ad_hoc';
 await save(rows);
 assert.deepEqual((await d1.prepare('SELECT category FROM state_ad_hoc_signups WHERE annual_student_id=? ORDER BY category').bind(poolRow.id).all()).results.map(r=>r.category),['team_contest','topical_team']);
 const optedOut=(await getStateWorksheet(db,stateId,schoolId)).rows.find(r=>r.id===replacement.id);
 optedOut.attending=false;defaultStateAdHoc(optedOut,true);optedOut.attending=true;defaultStateAdHoc(optedOut,true);
 assert.equal(optedOut.events.topical_team,'');
 const rawSheet=async()=> (await first('SELECT rows_json FROM state_worksheets WHERE contest_id=? AND school_id=?',stateId,schoolId)).rows_json;
 const activeCounts=()=>Promise.all([
  count('SELECT count(*) n FROM entries WHERE contest_id=? AND owner_school_id=?',stateId,schoolId),
  count('SELECT count(*) n FROM state_roster_members WHERE contest_id=? AND school_id=?',stateId,schoolId),
  count('SELECT count(*) n FROM state_ad_hoc_signups WHERE contest_id=? AND school_id=?',stateId,schoolId),
 ]);
 const saved=await rawSheet(), active=await activeCounts();
 assert.equal((await attendance('withdraw',coach,false)).status,400);
 await assert.rejects(attendance('withdraw',{...coach,coachAssignments:[]}),{status:403});
 assert((await attendance('withdraw')).success);
 assert.deepEqual(await activeCounts(),[0,0,0]);assert.equal(await rawSheet(),saved);
 assert((await getStateWorksheet(db,stateId,schoolId)).withdrawn);
 await assert.rejects(save(rows),{code:'withdrawn'});
 await assert.rejects(setStateAttendance(db,{contestId:stateId,schoolId,intent:'attending',actorUserId:coach.id}),{code:'withdrawn'});
 assert((await attendance('resume')).success);
 assert.deepEqual(await activeCounts(),active);
 const canonical=raw=>JSON.parse(raw).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(canonical(await rawSheet()),canonical(saved));
 // A never-confirmed school returns to undecided when it resumes.
 const undecided=dashboard.qualifiedSchools.find(s=>s.schoolId!==schoolId).schoolId;
 assert((await attendance('withdraw',admin,true,undecided)).success);
 assert.equal((await getStateWorksheet(db,stateId,undecided)).saved,false);
 assert((await attendance('resume',admin,true,undecided)).success);
 assert.equal((await first('SELECT intent FROM state_attendances WHERE contest_id=? AND school_id=?',stateId,undecided)).intent,'undecided');
 assert.equal((await getStateWorksheet(db,stateId,undecided)).saved,false);
 await d1.prepare("UPDATE contests SET lifecycle='roster_locked' WHERE id=?").bind(stateId).run();
 assert.equal((await attendance('withdraw')).status,400);
 assert((await attendance('withdraw',admin)).success);
 assert.equal((await attendance('resume')).status,400);
 assert((await attendance('resume',admin)).success);
 assert.deepEqual(await activeCounts(),active);
 await d1.prepare("UPDATE contests SET lifecycle='scoring' WHERE id=?").bind(stateId).run();
 assert.equal((await attendance('withdraw',admin)).status,400);
 assert.deepEqual(await activeCounts(),active);
 // Large state rosters must load beyond D1's 100-bound-parameter limit.
 const beforeLargeRoster = await getStateDashboard(db, stateId);
 for (let i = 0; i < 101; i++) {
  await d1.prepare("INSERT INTO entries (id, contest_id, owner_school_id, category, entry_kind, division) VALUES (?, ?, ?, 'project', 'team', ?)").bind(`large-roster-${i}`, stateId, schoolId, beforeLargeRoster.qualifiedSchools.find(s => s.schoolId === schoolId).division).run();
 }
 const largeRoster = await getStateDashboard(db, stateId);
 assert.equal(largeRoster.entries.length, beforeLargeRoster.entries.length + 101);
 assert.deepEqual(largeRoster.members, beforeLargeRoster.members);
 console.log('Synthetic D1 qualification and state-registration workflow passed.');
} finally {
 await vite.close();await mf.dispose();rmSync(temp,{recursive:true,force:true});
}
