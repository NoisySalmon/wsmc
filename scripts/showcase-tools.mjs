// Local demo helpers. Load the same application services used by page actions.
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { getPlatformProxy } from 'wrangler';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  contest: { type: 'string' }, exclude: { type: 'string', multiple: true, default: [] },
  seed: { type: 'string', default: '2026' }, 'persist-to': { type: 'string' }, help: { type: 'boolean' }
} });
const [command] = positionals;
if (values.help) {
  console.log(`Usage: node scripts/showcase-tools.mjs scores --contest CONTEST_ID [--seed TEXT]
       node scripts/showcase-tools.mjs regionals [--exclude CONTEST_ID ...] [--seed TEXT]
       node scripts/showcase-tools.mjs complete [--seed TEXT]
All commands: [--persist-to DIRECTORY] (same directory as seed:showcase).
Local showcase only. Scores fills blanks; regionals completes and publishes regionals;
complete continues through qualification publication, state registration and state results.
Existing scores and finalized contests are preserved. No remote option exists.`);
  process.exit(0);
}
if (!['scores', 'regionals', 'complete'].includes(command) || positionals.length !== 1) throw new Error('Choose scores, regionals or complete; use --help.');
if (command === 'scores' && !values.contest) throw new Error('scores requires --contest CONTEST_ID.');
if (command !== 'scores' && values.contest) throw new Error('--contest is only supported by scores.');
if (command !== 'regionals' && values.exclude.length) throw new Error('--exclude is only supported by regionals.');
const seasonId = 'season-2026', actorUserId = 'user-coordinator';
const proxy = await getPlatformProxy({ remoteBindings: false, ...(values['persist-to'] ? { persist: { path: resolve(values['persist-to'], 'v3') } } : {}) });
let vite;
try {
  const d1 = proxy.env.DB;
  const all = async (sql, ...args) => (await d1.prepare(sql).bind(...args).all()).results;
  const first = async (sql, ...args) => d1.prepare(sql).bind(...args).first();
  // Deliberately refuse historical replay and private snapshots, even locally.
  const marker = await first("SELECT id FROM users WHERE id=? AND email='coordinator@wsmc.example' AND display_name='Morgan Ellis (Demo)'", actorUserId);
  const fictional = await first("SELECT id FROM annual_students WHERE season_id=? AND id LIKE 'student-%' LIMIT 1", seasonId);
  if (!marker || !fictional) throw new Error('Expected fictional showcase data. Run npm run seed:showcase first.');
  if ((await first('SELECT status FROM seasons WHERE id=?', seasonId))?.status === 'archived') throw new Error('Archived showcase is read-only. Reseed first.');
  vite = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
  const load = (path) => vite.ssrLoadModule(`/src/lib/server/${path}.ts`);
  const { getDb } = await load('db/index');
  const db = getDb(d1);
  const scoring = await load('scoring/service');
  const program = await load('program/service');
  const registration = await load('registration/service');
  const context = (contestId) => ({ contestId, actorUserId });
  // Stable per entry identity, including state entries whose UUIDs change each run.
  const number = (key, min, max) => min + createHash('sha256').update(`${values.seed}:${key}`).digest().readUInt32LE(0) % (max - min + 1);
  async function fillScores(contestId) {
    const contest = await first('SELECT * FROM contests WHERE id=? AND season_id=?', contestId, seasonId);
    if (!contest) throw new Error(`Unknown showcase contest: ${contestId}`);
    if (contest.lifecycle === 'finalized') { console.log(`${contestId}: finalized; preserved`); return; }
    if (!['roster_locked', 'scoring'].includes(contest.lifecycle)) throw new Error(`${contestId}: lock rosters before filling scores.`);
    const entries = await all(`SELECT e.*, r.score, r.part1, r.part2, r.placement, r.knowdown_outcome, COALESCE(r.version,0) version
      FROM entries e LEFT JOIN results r ON r.entry_id=e.id
      WHERE e.contest_id=? AND NOT EXISTS (SELECT 1 FROM school_participations p WHERE p.contest_id=e.contest_id AND p.school_id=e.owner_school_id AND p.withdrawn_at IS NOT NULL)
      ORDER BY e.category, e.owner_school_id, e.entry_number, e.id`, contestId);
    const used = new Set(entries.filter(e => e.category === 'knowdown' && e.placement !== null).map(e => e.placement));
    let changed = 0;
    for (const e of entries) {
      const members = await all('SELECT annual_student_id FROM entry_members WHERE entry_id=? ORDER BY annual_student_id', e.id);
      const key = `${contestId}:${e.category}:${e.owner_school_id}:${e.entry_number}:${members.map(m => m.annual_student_id).join(',')}`;
      let score;
      if (e.category.startsWith('topical')) {
        if (e.part1 !== null && e.part2 !== null) continue;
        score = { part1: e.part1 ?? number(`${key}:1`, 15, 75), part2: e.part2 ?? number(`${key}:2`, 15, 75) };
      } else if (e.category === 'knowdown') {
        if (e.knowdown_outcome !== null || e.placement !== null) continue;
        const place = [1,2,3,4].find(p => !used.has(p));
        if (place) used.add(place);
        score = place ? { placement: place, knowdownOutcome: 'placed' } : { knowdownOutcome: 'eliminated' };
      } else {
        if (e.score !== null) continue;
        score = { score: number(key, e.category === 'project' ? 40 : 5, e.category === 'project' ? 100 : 40) };
      }
      await scoring.saveContestResult(db, { ...context(contestId), entryId: e.id, expectedVersion: e.version, ...score });
      changed++;
    }
    console.log(`${contestId}: filled ${changed} missing results`);
  }
  async function finish(contestId) {
    const c = await first('SELECT lifecycle FROM contests WHERE id=?', contestId);
    if (c.lifecycle !== 'finalized') {
      await fillScores(contestId);
      if (c.lifecycle !== 'scoring') await program.setContestLifecycle(db, contestId, seasonId, 'scoring');
      await scoring.finalizeContest(db, context(contestId));
    }
    if (!(await first('SELECT results_published_at FROM contests WHERE id=?', contestId)).results_published_at)
      await scoring.publishContestResults(db, context(contestId));
    const report = await scoring.getFinalizationReport(db, contestId);
    if (!report.complete) throw new Error(`Incomplete results: ${contestId}`);
    console.log(`${contestId}: finalized and published`);
  }
  async function regionals() {
    const contests = await all("SELECT * FROM contests WHERE season_id=? AND kind='regional' ORDER BY id", seasonId);
    for (const id of values.exclude) if (!contests.some(c => c.id === id)) throw new Error(`Unknown regional exclusion: ${id}`);
    for (const c of contests) {
      if (values.exclude.includes(c.id)) { console.log(`${c.id}: excluded`); continue; }
      if (['setup', 'registration_open'].includes(c.lifecycle)) {
        if (c.lifecycle === 'setup') await program.setContestLifecycle(db, c.id, seasonId, 'registration_open');
        const schools = await all('SELECT * FROM school_participations WHERE contest_id=? AND withdrawn_at IS NULL', c.id);
        for (const school of schools) {
          // Populate untouched schools only; never replace a coach's registration.
          const existing = await first('SELECT id FROM entries WHERE contest_id=? AND owner_school_id=? LIMIT 1', c.id, school.school_id);
          if (existing) continue;
          const students = await all('SELECT * FROM annual_students WHERE season_id=? AND school_id=? ORDER BY id', seasonId, school.school_id);
          if (students.length < 3) throw new Error(`Need at least three fictional students for ${school.school_id}`);
          const input = { contestId: c.id, schoolId: school.school_id };
          for (const s of students) {
            if (!await first('SELECT 1 FROM contest_roster_members WHERE contest_id=? AND annual_student_id=?', c.id, s.id))
              await registration.addRosterStudent(db, { ...input, studentId: s.id });
          }
          const team = [...new Map(students.map(s => [s.actual_grade, s])).values()].slice(0,3);
          await registration.saveTeamContestAssignments(db, { ...input, assignments: team.map(s => ({ studentId: s.id, team: 1, competingGrade: s.actual_grade })) });
          await registration.saveTopicalAssignments(db, { ...input, assignments: students.map(s => ({ studentId: s.id, mode: team.includes(s) ? 'team' : 'individual', team: team.includes(s) ? 1 : null, competingGrade: s.actual_grade })) });
          await registration.createProjectTeam(db, { ...input, members: team.map(s => ({ studentId: s.id, competingGrade: s.actual_grade })) });
          await registration.setKnowdownNominees(db, { ...input, studentIds: team.map(s => s.id) });
        }
        await program.setContestLifecycle(db, c.id, seasonId, 'roster_locked');
      }
      await finish(c.id);
    }
  }
  if (command === 'scores') await fillScores(values.contest);
  else {
    await regionals();
    if (command === 'complete') {
      const qualification = await load('qualification/workflow');
      let season = await first('SELECT status FROM seasons WHERE id=?', seasonId);
      if (season.status === 'regional') await program.setSeasonStatus(db, seasonId, 'qualifications');
      if ((await qualification.getQualificationWorkflow(db, seasonId)).status !== 'published') {
        await qualification.saveQualificationDraft(db, { seasonId, actorUserId, thresholds: { project: 75, team_contest: {1:25,2:25}, topical_team: {1:100,2:100}, topical_individual:100 } });
        await qualification.publishQualificationDraft(db, { seasonId, actorUserId });
      }
      const stateId = (await first("SELECT id FROM contests WHERE season_id=? AND kind='state'", seasonId)).id;
      const state = await first('SELECT lifecycle FROM contests WHERE id=?', stateId);
      if (state.lifecycle === 'registration_open') {
        const { getStateDashboard } = await load('state/service');
        const { getStateWorksheet, saveStateWorksheet } = await load('state/worksheet');
        const dashboard = await getStateDashboard(db, stateId);
        for (const school of dashboard.qualifiedSchools) {
          const sheet = await getStateWorksheet(db, stateId, school.schoolId);
          if (!sheet.saved && !sheet.withdrawn) await saveStateWorksheet(db, { ...context(stateId), schoolId: school.schoolId, rows: sheet.rows });
        }
        await program.setContestLifecycle(db, stateId, seasonId, 'roster_locked');
      }
      if (['registration_open','roster_locked'].includes(state.lifecycle)) {
        const { getAdHocDashboard, regenerateAdHocTeams } = await load('state/ad-hoc');
        for (const pool of await getAdHocDashboard(db, stateId)) if (pool.needsRegeneration) await regenerateAdHocTeams(db, { ...context(stateId), category: pool.category });
      }
      await finish(stateId);
      const rankings = await scoring.getStateRankings(db, stateId);
      const count = Object.values(rankings.rankings).reduce((n, rows) => n + rows.length, 0);
      if (!count) throw new Error('Expected nonempty state rankings.');
      console.log(`Showcase complete: published state results with ${count} ranked entries.`);
    }
  }
} finally {
  await vite?.close();
  await proxy.dispose();
}
