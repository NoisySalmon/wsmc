import { setContestLifecycle } from '../program/service';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from '$lib/server/db';
import { getStateWorksheet, saveStateWorksheet } from './worksheet';
import { getAdHocDashboard, regenerateAdHocTeams } from './ad-hoc';
import { getFinalizationReport, getScoringSnapshot, getStateRankings, saveScoreCell } from '../scoring/service';
// Real D1 exercises atomic upserts and batches with the same engine as the app.
const workers: Miniflare[] = [];
afterEach(async () => { await Promise.all(workers.splice(0).map((worker) => worker.dispose())); });
async function fixture() {
	const worker = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', compatibilityDate: '2026-03-10', d1Databases: ['DB'] });
	workers.push(worker);
	const d1 = await worker.getD1Database('DB');
	for (const file of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()) {
		const statements = readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map((statement) => statement.trim()).filter(Boolean);
		for (const statement of statements) await d1.prepare(statement).run();
	}
	// Seed script contains ordinary SQL statements separated by semicolons.
	for (const statement of readFileSync('scripts/seed.sql', 'utf8').split(';').map((sql) => sql.trim()).filter(Boolean)) await d1.prepare(statement).run();
	await d1.prepare("UPDATE contests SET lifecycle = 'roster_locked' WHERE kind = 'state'").run();
 await d1.exec("DELETE FROM entries WHERE contest_id = 'contest-state-2026'");
	return { db: getDb(d1 as unknown as D1Database), d1 };
}

const context = { contestId: 'contest-state-2026', actorUserId: 'user-coordinator' };
// Real D1 startup and worksheet round trips can exceed five seconds on CI.
describe('ad-hoc state contest workflow', { timeout: 15_000 }, () => {
 it('allows coaches to save assigned rosters and removes event opt-outs before regeneration', async () => {
  const { db, d1 } = await fixture();
  await d1.prepare("UPDATE contests SET lifecycle='registration_open' WHERE id=?").bind(context.contestId).run();
  for (const schoolId of ['school-alpha', 'school-beta']) {
   const sheet = await getStateWorksheet(db, context.contestId, schoolId);
   await saveStateWorksheet(db, { ...context, schoolId, rows: sheet.rows });
  }
  await regenerateAdHocTeams(db, { ...context, category: 'team_contest' });
  const before = (await getAdHocDashboard(db, context.contestId))[0];
  expect(before.teams.flatMap(t => t.members).some(s => s.id === 'student-alpha-10')).toBe(true);
  const sheet = await getStateWorksheet(db, context.contestId, 'school-alpha');
  await saveStateWorksheet(db, { ...context, schoolId: 'school-alpha', rows: sheet.rows });
  expect((await getAdHocDashboard(db, context.contestId))[0].teams).toEqual(before.teams);
  const row = sheet.rows.find(r => r.id === 'student-alpha-10')!;
  row.events.team_contest = '';
  await saveStateWorksheet(db, { ...context, schoolId: 'school-alpha', rows: sheet.rows });
  const changed = (await getAdHocDashboard(db, context.contestId))[0];
  expect(changed.teams.flatMap(t => t.members).some(s => s.id === row.id)).toBe(false);
  expect(changed.needsRegeneration).toBe(true);
  await regenerateAdHocTeams(db, { ...context, category: 'team_contest' });
  expect((await getAdHocDashboard(db, context.contestId))[0].needsRegeneration).toBe(false);
 });

 it('builds independent mixed-division pools, scopes coach teammates, and scores and ranks separately', async () => {
  const { db, d1 } = await fixture();
  const ids = ['student-alpha-12', 'student-alpha-11', 'student-beta-12', 'student-gamma-10'];
  for (const id of ids) {
   await d1.prepare("INSERT OR IGNORE INTO state_roster_members (contest_id,school_id,annual_student_id,admission_basis) SELECT ?,school_id,id,'ad_hoc' FROM annual_students WHERE id=?").bind(context.contestId,id).run();
   for (const category of ['team_contest','topical_team']) await d1.prepare("INSERT INTO state_ad_hoc_signups (contest_id,school_id,annual_student_id,category,created_at) SELECT ?,school_id,id,?,0 FROM annual_students WHERE id=?").bind(context.contestId,category,id).run();
  }
  await expect(setContestLifecycle(db, context.contestId, 'season-2026', 'scoring')).rejects.toMatchObject({ code: 'ad_hoc_pending' });
  const builds = await Promise.allSettled([regenerateAdHocTeams(db, { ...context, category: 'team_contest' }), regenerateAdHocTeams(db, { ...context, category: 'team_contest' })]);
  expect(builds.some(result => result.status === 'fulfilled')).toBe(true);
  let pools = await getAdHocDashboard(db, context.contestId);
  expect(pools[0].teams.map(t => t.members.length)).toEqual([2,2]);
  expect(pools[1].teams).toEqual([]);
  const before = pools[0].teams;
  await regenerateAdHocTeams(db, { ...context, category: 'team_contest' });
  expect((await getAdHocDashboard(db, context.contestId))[0].teams).toEqual(before);
  await regenerateAdHocTeams(db, { ...context, category: 'topical_team' });
  pools = await getAdHocDashboard(db, context.contestId);
  const coach = await getAdHocDashboard(db, context.contestId, 'school-beta');
  expect(coach[0].teams).toHaveLength(1);
  expect(coach[0].teams[0].members).toHaveLength(2);
  expect(coach[0].teams[0].members.every(s => s.schoolName && s.name && s.actualGrade)).toBe(true);
  expect((await getFinalizationReport(db, context.contestId)).missing).toHaveLength(4);
  await setContestLifecycle(db, context.contestId, 'season-2026', 'scoring');
  await expect(regenerateAdHocTeams(db, { ...context, category: 'team_contest' })).rejects.toMatchObject({ code: 'locked' });
  for (const team of pools[0].teams) await saveScoreCell(db, { ...context, entryId: team.id, field:'score', value:0 });
  for (const team of pools[1].teams) {
   await saveScoreCell(db, { ...context, entryId: team.id, field:'part1', value:10 });
   await saveScoreCell(db, { ...context, entryId: team.id, field:'part2', value:20 });
  }
  const snapshot = await getScoringSnapshot(db, context.contestId);
  expect(new Set(snapshot.entries.map(e => e.section))).toEqual(new Set(['ad_hoc_team_contest','ad_hoc_topical_team']));
  expect((await getFinalizationReport(db, context.contestId)).complete).toBe(true);
  await d1.prepare("UPDATE contests SET lifecycle='finalized' WHERE id=?").bind(context.contestId).run();
  const { rankings } = await getStateRankings(db, context.contestId);
  expect(rankings.team_contest).toEqual([]);
  expect(rankings.topical_team).toEqual([]);
  expect(rankings.ad_hoc_team_contest.map(t => t.rank)).toEqual([1,1]);
  expect(rankings.ad_hoc_topical_team.map(t => t.score)).toEqual([30,30]);
  expect(rankings.ad_hoc_topical_team.every(t => t.studentName?.includes('('))).toBe(true);
 });
});
