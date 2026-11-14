import { afterEach, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { GET } from './+server';

describe('report endpoint authorization', () => {
	it('rejects unauthenticated report downloads before touching the database', async () => {
		await expect(GET({
			locals: { principal: null, sessionId: null }, platform: undefined,
			params: { kind: 'results' }, url: new URL('https://wsmc.example/reports/results?contestId=contest-1'),
		} as never)).rejects.toMatchObject({ status: 401 });
	});
});

// Local SQLite can accept more parameters than deployed D1. Keep the deployed
// 100-parameter contract at the adapter boundary, while executing real SQL.
const workers: Miniflare[] = [];
afterEach(async () => { await Promise.all(workers.splice(0).map(worker => worker.dispose())); });

it('exports every published qualification and reason beyond one hundred records', { timeout: 20_000 }, async () => {
 const worker = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', compatibilityDate: '2026-03-10', d1Databases: ['DB'] });
 workers.push(worker);
 const d1 = await worker.getD1Database('DB');
 for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)) await d1.prepare(statement).run();
 }
 for (const statement of readFileSync('scripts/seed.sql', 'utf8').split(';').map(sql => sql.trim()).filter(Boolean)) await d1.prepare(statement).run();
 await d1.prepare(`WITH RECURSIVE sequence(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM sequence WHERE n<105)
  INSERT INTO entries (id,contest_id,owner_school_id,category,entry_kind,entry_number,division)
  SELECT 'bulk-entry-'||n,'contest-region-1','school-alpha','team_contest','team',200+n,1 FROM sequence`).run();
 await d1.prepare(`INSERT INTO qualifications (id,round_id,season_id,entry_id)
  SELECT 'bulk-qualification-'||entry_number,'round-regional-2026','season-2026',id FROM entries WHERE entry_number BETWEEN 201 AND 305`).run();
 await d1.prepare(`INSERT INTO qualification_reasons (id,qualification_id,kind,rank)
  SELECT 'bulk-reason-'||entry_number,'bulk-qualification-'||entry_number,'regional_placement',entry_number FROM entries WHERE entry_number BETWEEN 201 AND 304`).run();
 await d1.prepare("INSERT INTO qualification_rounds (id,season_id,kind,status,created_by) VALUES ('draft-report','season-2026','state_cutoff','draft','user-coordinator')").run();
 await d1.prepare("INSERT INTO qualifications (id,round_id,season_id,entry_id) VALUES ('unpublished-report-qualification','draft-report','season-2026','bulk-entry-1')").run();
 await d1.prepare("INSERT INTO qualification_reasons (id,qualification_id,kind) VALUES ('unpublished-report-reason','unpublished-report-qualification','state_cutoff')").run();
 const boundedD1 = new Proxy(d1, {
  get(target, property) {
   if (property === 'prepare') return (query: string) => {
    const statement = target.prepare(query);
    return new Proxy(statement, {
     get(prepared, key) {
      if (key === 'bind') return (...values: unknown[]) => {
       expect(values.length, 'D1 limits SQL statements to 100 bound parameters').toBeLessThanOrEqual(100);
       return prepared.bind(...values);
      };
      const value = Reflect.get(prepared, key);
      return typeof value === 'function' ? value.bind(prepared) : value;
     },
    });
   };
   const value = Reflect.get(target, property);
   return typeof value === 'function' ? value.bind(target) : value;
  },
 });
 const response = await GET({
  locals: { principal: { id: 'user-coordinator', email: 'coordinator@example.com', displayName: 'Coordinator', isAdmin: true, regionalContestIds: [], coachAssignments: [], scorekeeperContestIds: [] }, sessionId: 'test-session' },
  platform: { env: { DB: boundedD1 } }, params: { kind: 'qualifications' },
  url: new URL('https://wsmc.example/reports/qualifications?seasonId=season-2026'),
 } as never);
 const csv = await response.text();
 expect(response.status).toBe(200);
 expect(csv.trimEnd().split('\r\n')).toHaveLength(113); // Header, 7 seeded, 105 added.
 expect(csv).toContain('"bulk-qualification-304"');
 expect(csv).toContain('"regional_placement","304"');
 expect(csv).toContain('"bulk-qualification-305"'); // A qualification without reasons still exports.
 expect(csv).not.toContain('unpublished-report-qualification');
 expect(csv).not.toContain('state_cutoff');
});
