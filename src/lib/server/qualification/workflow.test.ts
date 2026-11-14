import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb, type Database } from '$lib/server/db';
import { getRegionalRankings } from '$lib/server/scoring/service';
import { getQualificationPlanningData, recordManualQualificationDecision } from './cutoff-service';
import { publishQualificationDraft, saveQualificationDraft } from './workflow';

const workers: Miniflare[] = [];
afterEach(async () => { await Promise.all(workers.splice(0).map(worker => worker.dispose())); });
const input = { seasonId: 'season', actorUserId: 'coordinator', thresholds: { project: null, team_contest: { 1: null, 2: null }, topical_team: { 1: null, 2: null }, topical_individual: null } };
async function fixture() {
 const worker = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', compatibilityDate: '2026-03-10', d1Databases: ['DB'] });
 workers.push(worker);
 const d1 = await worker.getD1Database('DB');
 for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)) await d1.prepare(statement).run();
 }
 for (const statement of [
  "INSERT INTO seasons (id,year,status) VALUES ('season',2026,'qualifications')",
  "INSERT INTO users (id,email,status) VALUES ('coordinator','test@example.test','active')",
  "INSERT INTO regions (id,season_id,number) VALUES ('region','season',1)",
  "INSERT INTO contests (id,season_id,region_id,kind,name,lifecycle) VALUES ('regional','season','region','regional','Regional','scoring')",
  "INSERT INTO schools (id,name,short_name) VALUES ('a','School A','A'),('b','School B','B')",
  "INSERT INTO school_participations (id,contest_id,school_id,division) VALUES ('pa','regional','a',1),('pb','regional','b',1)",
  "INSERT INTO annual_students (id,season_id,school_id,name,actual_grade) VALUES ('student','season','a','Student',10)",
  "INSERT INTO entries (id,contest_id,owner_school_id,category,entry_kind,entry_number,division) VALUES ('team-a','regional','a','team_contest','team',1,1),('team-b','regional','b','team_contest','team',1,1),('individual','regional','a','topical_individual','individual',1,1)",
  "INSERT INTO entry_members (entry_id,annual_student_id) VALUES ('individual','student')",
  "INSERT INTO results (entry_id,score,part1,part2) VALUES ('team-a',90,NULL,NULL),('team-b',80,NULL,NULL),('individual',100,50,50)",
  "UPDATE contests SET lifecycle='finalized' WHERE id='regional'",
 ]) await d1.prepare(statement).run();
 return { d1, db: getDb(d1 as unknown as D1Database) };
}

describe('qualification snapshots in D1', { timeout: 15_000 }, () => {
 it('requires review again after a corrected regional and publishes the regenerated winner', async () => {
  const { db, d1 } = await fixture();
  await saveQualificationDraft(db, input);
  await d1.prepare("UPDATE contests SET lifecycle='scoring' WHERE id='regional'").run();
  await d1.prepare("UPDATE results SET score=95,version=version+1 WHERE entry_id='team-b'").run();
  await d1.prepare("UPDATE contests SET lifecycle='finalized' WHERE id='regional'").run();
  await expect(publishQualificationDraft(db, input)).rejects.toMatchObject({ code: 'stale_draft' });
  expect(await d1.prepare("SELECT status FROM seasons WHERE id='season'").first('status')).toBe('qualifications');
  expect(await d1.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='qualifications_published'").first('n')).toBe(0);
  await saveQualificationDraft(db, input);
  await publishQualificationDraft(db, input);
  const teams = await d1.prepare("SELECT entry_id FROM qualifications WHERE entry_id LIKE 'team-%' AND active=1").all();
  expect(teams.results.map(row => row.entry_id)).toEqual(['team-b']);
 });

 it.each(['regional correction', 'manual exception', 'saved cutoffs'])('rolls back publication when %s changes between validation and the commit batch', async (change) => {
  const { db, d1 } = await fixture();
  await saveQualificationDraft(db, input);
  const raced = new Proxy(db, { get(target, property) {
   if (property === 'batch') return async (operations: Parameters<Database['batch']>[0]) => {
    if (change === 'regional correction') {
     await d1.prepare("UPDATE contests SET lifecycle='scoring' WHERE id='regional'").run();
     await d1.prepare("UPDATE results SET score=95,version=version+1 WHERE entry_id='team-b'").run();
     await d1.prepare("UPDATE contests SET lifecycle='finalized' WHERE id='regional'").run();
    } else if (change === 'manual exception') {
     await recordManualQualificationDecision(db, { ...input, entryId: 'team-b', include: true, reason: 'Late review' });
    } else {
     await saveQualificationDraft(db, { ...input, thresholds: { ...input.thresholds, team_contest: { 1: 0, 2: 0 } } });
    }
    return target.batch(operations);
   };
   return Reflect.get(target, property);
  } });
  await expect(publishQualificationDraft(raced, input)).rejects.toMatchObject({ code: 'stale_draft' });
  expect(await d1.prepare("SELECT status FROM seasons WHERE id='season'").first('status')).toBe('qualifications');
  expect(await d1.prepare("SELECT COUNT(*) n FROM qualification_rounds WHERE status='published'").first('n')).toBe(0);
 });

 it('invalidates grade-based eligibility and keeps one round per kind during concurrent first saves', async () => {
  const { db, d1 } = await fixture();
  const attempts = await Promise.allSettled([saveQualificationDraft(db, input), saveQualificationDraft(db, input)]);
  expect(attempts.some(attempt => attempt.status === 'fulfilled')).toBe(true);
  const rounds = await d1.prepare('SELECT kind,COUNT(*) n FROM qualification_rounds GROUP BY kind').all();
  expect(rounds.results).toEqual([{ kind: 'regional_placements', n: 1 }, { kind: 'state_cutoff', n: 1 }]);
  await expect(d1.prepare("INSERT INTO qualification_rounds (id,season_id,kind,created_by) VALUES ('duplicate','season','state_cutoff','coordinator')").run()).rejects.toThrow(/UNIQUE/);
  await d1.prepare("UPDATE annual_students SET actual_grade=11 WHERE id='student'").run();
  await expect(publishQualificationDraft(db, input)).rejects.toMatchObject({ code: 'stale_draft' });
 });

 it('aggregates regional ranking semantics with a fixed season-wide query budget', async () => {
  const { db, d1 } = await fixture();
  const expected = (await getRegionalRankings(db, 'regional')).rankings;
  let selects = 0;
  const measured = new Proxy(db, { get(target, property) {
   if (property === 'select') return (...args: Parameters<Database['select']>) => { selects++; return target.select(...args); };
   return Reflect.get(target, property);
  } });
  // Eleven regional contests must fit comfortably under the free-plan per-request query cap.
  for (let i = 2; i <= 11; i++) {
   await d1.prepare('INSERT INTO regions (id,season_id,number) VALUES (?,\'season\',?)').bind(`region-${i}`, i).run();
   await d1.prepare("INSERT INTO contests (id,season_id,region_id,kind,name,lifecycle) VALUES (?,'season',?,'regional','Empty Regional','finalized')").bind(`regional-${i}`, `region-${i}`).run();
  }
  const planning = await getQualificationPlanningData(measured, 'season');
  expect(planning.rows.map(({ regionNumber, regionName, ...row }) => row)).toEqual(Object.values(expected).flat());
  expect(planning.finalized).toBe(11);
  expect(selects).toBeLessThanOrEqual(4);
 });
});
