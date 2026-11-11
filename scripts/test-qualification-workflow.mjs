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
	await assert.rejects(publishQualificationDraft(db, input), { code: 'not_frozen' });
	await saveQualificationDraft(db, input);
	const planning = await getQualificationPlanningData(db, input.seasonId);
	assert(planning.members.every(member => typeof member.studentName === 'string' && member.studentName.length));
	assert.equal(await scalar("SELECT count(*) n FROM qualifications q JOIN qualification_rounds r ON r.id=q.round_id WHERE r.kind='state_cutoff'"), 66);
	assert.equal(await scalar("SELECT count(*) n FROM qualifications q JOIN qualification_rounds r ON r.id=q.round_id WHERE r.kind='regional_placements' AND q.active=1"), 190);
	assert.equal(await visibility(), 0);
	await saveQualificationDraft(db, { ...input, thresholds: Object.fromEntries(Object.keys(input.thresholds).map(key => [key, { 1: 999, 2: 999 }])) });
	assert.equal(await scalar("SELECT count(*) n FROM qualifications q JOIN qualification_rounds r ON r.id=q.round_id WHERE r.kind='state_cutoff'"), 0);
	await d1.prepare("UPDATE contests SET lifecycle='scoring' WHERE id='contest-region-1'").run();
	await assert.rejects(saveQualificationDraft(db, { ...input, freeze: true }), { code: 'incomplete' });
	await d1.prepare("UPDATE contests SET lifecycle='finalized' WHERE id='contest-region-1'").run();
	const { previewStateCutoffs } = await vite.ssrLoadModule('/src/lib/qualification.ts');
	const excluded = planning.automaticEntryIds[0];
	const included = previewStateCutoffs(planning.rows, input.thresholds, new Set(planning.automaticEntryIds)).find(row => row.added).entryId;
	await recordManualQualificationDecision(db, { ...input, entryId: excluded, include: false, reason: 'Reviewed exclusion' });
	await recordManualQualificationDecision(db, { ...input, entryId: included, include: true, reason: 'Reviewed inclusion' });
	await saveQualificationDraft(db, { ...input, freeze: true });
	assert.equal((await d1.prepare('SELECT count(*) n FROM qualifications WHERE entry_id=? AND active=1').bind(excluded).first()).n, 0);
	assert.equal((await d1.prepare('SELECT count(*) n FROM qualifications WHERE entry_id=? AND active=1').bind(included).first()).n, 1);

	assert.equal((await getQualificationWorkflow(db, input.seasonId)).status, 'frozen');
	assert.equal((await d1.prepare('SELECT status FROM seasons').first()).status, 'qualifications');
	assert.equal(await visibility(), 0);
	await assert.rejects(setSeasonStatus(db, input.seasonId, 'state'), { code: 'incomplete' });
	const frozen = await snapshot();
	await assert.rejects(saveQualificationDraft(db, input), { code: 'locked' });
	await assert.rejects(recordManualQualificationDecision(db, { ...input, entryId: planning.rows[0].entryId, include: false, reason: 'Cannot change a frozen list' }), { code: 'frozen' });
	assert.deepEqual(await snapshot(), frozen);
	await publishQualificationDraft(db, input);
	assert.equal((await getQualificationWorkflow(db, input.seasonId)).status, 'published');
	assert.equal((await d1.prepare('SELECT status FROM seasons').first()).status, 'state');
	assert((await visibility()) > 250); // Includes inactive Knowdown alternates, not just active qualifiers.
	assert.deepEqual(await snapshot(), frozen); // Publish the saved snapshot without recalculation.
	await assert.rejects(saveQualificationDraft(db, input), { code: 'locked' });
	console.log('Qualification D1 workflow passed: persisted defaults, named members, combined draft, replacement, finalization gate, freeze, hidden-before-publication, immutable publication, state transition.');
} finally {
	await vite.close(); await mf.dispose(); rmSync(temp, { recursive: true, force: true });
}
