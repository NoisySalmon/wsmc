import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from '$lib/server/db';
import { getFinalizationReport, getScoringSnapshot, saveKnowdownPlace, saveScoreCell } from './service';

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
	await d1.prepare("UPDATE contests SET lifecycle = 'scoring'").run();
	return { db: getDb(d1 as unknown as D1Database), d1 };
}
const context = { contestId: 'contest-region-1', actorUserId: 'user-coordinator' };

describe('interactive score entry persistence', () => {
	it('saves independent topical cells, preserves zero, and lets the last cell entry win', async () => {
		const { db, d1 } = await fixture();
		const entryId = String((await d1.prepare("SELECT id FROM entries WHERE contest_id = ? AND category = 'topical_team' LIMIT 1").bind(context.contestId).first())!.id);
		await Promise.all([
			saveScoreCell(db, { ...context, entryId, field: 'part1', value: 0 }),
			saveScoreCell(db, { ...context, entryId, field: 'part2', value: 45 }),
		]);
		const result = () => d1.prepare('SELECT part1, part2, score FROM results WHERE entry_id = ?').bind(entryId).first();
		expect(await result()).toMatchObject({ part1: 0, part2: 45, score: 45 });
		await saveScoreCell(db, { ...context, entryId, field: 'part1', value: 25 });
		expect(await result()).toMatchObject({ part1: 25, part2: 45, score: 70 });
		await saveScoreCell(db, { ...context, entryId, field: 'part2', value: null });
		expect(await result()).toMatchObject({ part1: 25, part2: null, score: null });
		await expect(saveScoreCell(db, { ...context, entryId, field: 'part1', value: 76 })).rejects.toMatchObject({ code: 'invalid_part' });
		expect(await result()).toMatchObject({ part1: 25, part2: null });
	});

	it('replaces and clears places atomically, and treats unselected students as eliminated', async () => {
		const { db, d1 } = await fixture();
		const ids = (await d1.prepare("SELECT id FROM entries WHERE contest_id = ? AND category = 'knowdown' ORDER BY id").bind(context.contestId).all()).results.map((row) => String(row.id));
		await d1.exec("DELETE FROM results WHERE entry_id IN (SELECT id FROM entries WHERE category = 'knowdown')");
		await saveKnowdownPlace(db, { ...context, entryId: ids[0], placement: 1 });
		await saveKnowdownPlace(db, { ...context, entryId: ids[1], placement: 1 });
		const snapshot = await getScoringSnapshot(db, context.contestId);
		expect(snapshot.entries.find((entry) => entry.id === ids[0])).toMatchObject({ placement: null, knowdownOutcome: 'eliminated' });
		expect(snapshot.entries.find((entry) => entry.id === ids[1])).toMatchObject({ placement: 1, knowdownOutcome: 'placed' });
		expect(snapshot.entries.find((entry) => entry.id === ids[2])).toMatchObject({ placement: null, knowdownOutcome: 'eliminated' });
		await saveKnowdownPlace(db, { ...context, entryId: ids[1], placement: 4 });
		expect(await d1.prepare('SELECT placement FROM results WHERE entry_id = ?').bind(ids[1]).first()).toMatchObject({ placement: 4 });
		await saveKnowdownPlace(db, { ...context, entryId: null, placement: 4 });
		expect((await getFinalizationReport(db, context.contestId)).missing.filter((entry) => entry.category === 'knowdown')).toEqual([]);
		expect((await d1.prepare('SELECT COUNT(*) AS count FROM results WHERE placement IS NOT NULL').first())!.count).toBe(0);
	});

	it('rejects out-of-contest, wrong-category, and finalized changes without writing', async () => {
		const { db, d1 } = await fixture();
		const entryId = String((await d1.prepare("SELECT id FROM entries WHERE contest_id = ? AND category = 'team_contest' LIMIT 1").bind(context.contestId).first())!.id);
		await expect(saveScoreCell(db, { ...context, contestId: 'contest-region-2', entryId, field: 'score', value: 10 })).rejects.toMatchObject({ code: 'entry_out_of_scope' });
		await expect(saveKnowdownPlace(db, { ...context, entryId, placement: 1 })).rejects.toMatchObject({ code: 'entry_out_of_scope' });
		await d1.prepare("UPDATE contests SET lifecycle = 'finalized' WHERE id = ?").bind(context.contestId).run();
		await expect(saveScoreCell(db, { ...context, entryId, field: 'score', value: 10 })).rejects.toMatchObject({ code: 'locked' });
	});
});
