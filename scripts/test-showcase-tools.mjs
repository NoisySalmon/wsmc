// CLI/storage contract: partial scores survive, exclusions stay untouched,
// repeat runs preserve results, and the generated season reaches public state results.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { createServer } from 'vite';

const temp = mkdtempSync(join(tmpdir(), 'wsmc-showcase-tools-'));
const run = (...args) => execFileSync('node', ['scripts/showcase-tools.mjs', ...args, '--persist-to', temp], { encoding:'utf8', stdio:'pipe' });
async function query(sql) {
  const proxy = await getPlatformProxy({ remoteBindings:false, persist:{ path:join(temp,'v3') } });
  try { return (await proxy.env.DB.prepare(sql).all()).results; }
  finally { await proxy.dispose(); }
}
async function prepareStateRegistration() {
  const proxy = await getPlatformProxy({ remoteBindings:false, persist:{ path:join(temp,'v3') } });
  const vite = await createServer({ server:{ middlewareMode:true }, logLevel:'error' });
  try {
    const { getDb } = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
    const { setSeasonStatus } = await vite.ssrLoadModule('/src/lib/server/program/service.ts');
    const { saveQualificationDraft, publishQualificationDraft } = await vite.ssrLoadModule('/src/lib/server/qualification/workflow.ts');
    const { getStateDashboard, setStateAttendance } = await vite.ssrLoadModule('/src/lib/server/state/service.ts');
    const { changeStateSchoolAttendance } = await vite.ssrLoadModule('/src/lib/server/state/worksheet.ts');
    const db = getDb(proxy.env.DB), seasonId = 'season-2026', contestId = 'contest-state-2026', actorUserId = 'user-coordinator';
    await setSeasonStatus(db, seasonId, 'qualifications');
    await saveQualificationDraft(db, { seasonId, actorUserId, thresholds:{ project:75, team_contest:{1:25,2:25}, topical_team:{1:100,2:100}, topical_individual:100 } });
    await publishQualificationDraft(db, { seasonId, actorUserId });
    const schools = (await getStateDashboard(db, contestId)).qualifiedSchools.map(s => s.schoolId);
    assert(schools.length > 3);
    const [decided, withdrawn, ...targets] = schools;
    await setStateAttendance(db, { contestId, schoolId:decided, intent:'not_attending', actorUserId });
    await changeStateSchoolAttendance(db, { contestId, schoolId:withdrawn, change:'withdraw', principal:{ id:actorUserId, isAdmin:true } });
    return { decided, withdrawn, targets };
  } finally { await vite.close(); await proxy.dispose(); }
}
try {
  execFileSync('bash', ['scripts/seed-showcase.sh', temp], { stdio:'pipe' });
  const original = await query("SELECT r.* FROM results r JOIN entries e ON e.id=r.entry_id WHERE e.contest_id='contest-region-5' ORDER BY entry_id");
  run('scores', '--contest', 'contest-region-5');
  const filled = await query("SELECT r.* FROM results r JOIN entries e ON e.id=r.entry_id WHERE e.contest_id='contest-region-5' ORDER BY entry_id");
  for (const row of original) {
    const after = filled.find(r => r.entry_id === row.entry_id);
    for (const key of ['score','part1','part2','placement','knowdown_outcome']) {
      if (row[key] !== null) assert.equal(after[key], row[key], `Preserve ${row.entry_id} ${key}`);
    }
  }
  assert(filled.every(r => r.part1 === null || r.part2 !== null));
  run('scores', '--contest', 'contest-region-5');
  assert.deepEqual(await query("SELECT r.* FROM results r JOIN entries e ON e.id=r.entry_id WHERE e.contest_id='contest-region-5' ORDER BY entry_id"), filled);
  const excluded = await query("SELECT * FROM contests WHERE id='contest-region-2'");
  run('regionals', '--exclude', 'contest-region-2');
  assert.deepEqual(await query("SELECT * FROM contests WHERE id='contest-region-2'"), excluded);
  assert.equal((await query("SELECT count(*) n FROM contests WHERE kind='regional' AND lifecycle='finalized'"))[0].n, 10);
  assert.equal((await query('SELECT count(*) n FROM qualification_rounds'))[0].n, 0);
  assert.throws(() => run('attendance'), /requires --intent/);
  assert.throws(() => run('attendance', '--intent', 'invalid'), /requires --intent/);
  assert.throws(() => run('attendance', '--intent', 'attending'), /State registration is closed/);
  run('regionals');
  const { decided, withdrawn, targets } = await prepareStateRegistration();
  assert.throws(() => run('attendance', '--intent', 'attending', '--contest', 'contest-region-2'), /Unknown showcase state contest/);
  assert(run('attendance', '--intent', 'attending').includes(`${targets.length} schools opted in.`));
  const worksheets = await query('SELECT * FROM state_worksheets ORDER BY school_id');
  assert.deepEqual(worksheets.map(w => w.school_id).sort(), [...targets].sort());
  assert(worksheets.every(w => JSON.parse(w.rows_json).some(r => r.attending)));
  assert((await query('SELECT count(*) n FROM state_roster_members'))[0].n > 0);
  assert.equal((await query(`SELECT intent FROM state_attendances WHERE school_id='${decided}'`))[0].intent, 'not_attending');
  assert((await query(`SELECT withdrawn_at FROM school_participations WHERE contest_id='contest-state-2026' AND school_id='${withdrawn}'`))[0].withdrawn_at);
  assert(run('attendance', '--intent', 'attending').includes('0 schools opted in.'));
  assert.deepEqual(await query('SELECT * FROM state_worksheets ORDER BY school_id'), worksheets);
  // Reopen one attendance decision to exercise opt-out while preserving all others.
  await query(`UPDATE state_attendances SET intent='undecided' WHERE school_id='${targets[0]}'`);
  assert(run('attendance', '--intent', 'not_attending', '--contest', 'contest-state-2026').includes('1 school opted out.'));
  const optedOut = await query(`SELECT * FROM state_worksheets WHERE school_id='${targets[0]}'`);
  assert(JSON.parse(optedOut[0].rows_json).every(r => !r.attending));
  assert.equal((await query(`SELECT count(*) n FROM state_roster_members WHERE school_id='${targets[0]}'`))[0].n, 0);
  assert.equal((await query(`SELECT count(*) n FROM entries WHERE contest_id='contest-state-2026' AND owner_school_id='${targets[0]}'`))[0].n, 0);
  assert.deepEqual(await query(`SELECT * FROM state_worksheets WHERE school_id<>'${targets[0]}' ORDER BY school_id`), worksheets.filter(w => w.school_id !== targets[0]));
  assert(run('attendance', '--intent', 'not_attending').includes('0 schools opted out.'));
  run('complete');
  const state = (await query("SELECT * FROM contests WHERE kind='state'"))[0];
  assert.equal(state.lifecycle, 'finalized');
  assert(state.results_published_at);
  assert((await query("SELECT count(*) n FROM entries WHERE contest_id='contest-state-2026'"))[0].n > 0);
  assert((await query("SELECT count(*) n FROM state_roster_members"))[0].n > 0);
  assert.equal((await query("SELECT count(*) n FROM entries e LEFT JOIN results r ON e.id=r.entry_id WHERE e.contest_id='contest-state-2026' AND ((e.category IN ('topical_team','topical_individual') AND (r.part1 IS NULL OR r.part2 IS NULL)) OR (e.category IN ('project','team_contest') AND r.score IS NULL))"))[0].n, 0);
  const results = await query('SELECT * FROM results ORDER BY entry_id');
  assert.throws(() => run('attendance', '--intent', 'not_attending'), /State registration is closed/);
  run('complete');
  assert.deepEqual(await query('SELECT * FROM results ORDER BY entry_id'), results);
  assert.deepEqual(await query('PRAGMA foreign_key_check'), []);
  await query("UPDATE users SET display_name='Historical coordinator' WHERE id='user-coordinator'");
  assert.throws(() => run('scores', '--contest', 'contest-state-2026'), /Expected fictional showcase data/);
  execFileSync('bash', ['scripts/seed-showcase.sh', temp], { stdio:'pipe' });
  assert.equal((await query("SELECT lifecycle FROM contests WHERE kind='state'"))[0].lifecycle, 'setup');
  assert.equal((await query('SELECT count(*) n FROM state_worksheets'))[0].n, 0);
  assert.equal((await query('SELECT count(*) n FROM state_ad_hoc_signups'))[0].n, 0);
  assert.equal((await query('SELECT count(*) n FROM qualification_rounds'))[0].n, 0);
  assert.deepEqual(await query('PRAGMA foreign_key_check'), []);
  console.log('Showcase CLI journey passed: preservation, repeat runs, exclusion, qualifications, state registration and published state results.');
} finally { rmSync(temp, { recursive:true, force:true }); }
