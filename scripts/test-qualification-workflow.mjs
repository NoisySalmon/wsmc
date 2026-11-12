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
	console.log('Qualification D1 workflow passed: persisted defaults, named members, combined draft, replacement, finalization gate, legacy frozen draft editing, unsaved exception gate, hidden-before-publication, immutable publication, state transition.');
} finally {
	await vite.close(); await mf.dispose(); rmSync(temp, { recursive: true, force: true });
}
