import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from '$lib/server/db';
import { saveResult } from '$lib/server/db/repositories';
import { finalizeContest, publishContestResults, reopenContest, saveContestResult, saveKnowdownPlace, saveScoreCell } from './service';

const workers: Miniflare[] = [];
afterEach(async () => { await Promise.all(workers.splice(0).map(worker => worker.dispose())); });
const contestId = 'contest-region-1';
const actorUserId = 'user-coordinator';
async function fixture() {
	const worker = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', compatibilityDate: '2026-03-10', d1Databases: ['DB'] });
	workers.push(worker);
	const d1 = await worker.getD1Database('DB');
	for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
		for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await d1.prepare(statement).run();
	}
	for (const statement of readFileSync('scripts/seed.sql', 'utf8').split(';').map(s => s.trim()).filter(Boolean)) await d1.prepare(statement).run();
	await d1.prepare("UPDATE contests SET lifecycle = 'scoring' WHERE id = ?").bind(contestId).run();
	const entryId = String((await d1.prepare("SELECT id FROM entries WHERE contest_id = ? AND category = 'team_contest' LIMIT 1").bind(contestId).first())!.id);
	return { d1, entryId, db: getDb(d1 as unknown as D1Database) };
}

/** Interleave a real committed D1 write immediately after a chosen read returns.
 * Wrapping the platform API keeps SQL predicates and transactional batches real. */
function afterRead(d1: D1Database, matches: (query: string) => boolean, change: () => Promise<unknown>) {
	let fired = false;
	const originals = new WeakMap<object, D1PreparedStatement>();
	const wrap = (statement: D1PreparedStatement, query: string): D1PreparedStatement => {
		const proxy = new Proxy(statement, { get(target, key) {
			if (key === 'bind') return (...args: unknown[]) => wrap(target.bind(...args), query);
			if (key === 'raw' || key === 'all' || key === 'first') return async (...args: unknown[]) => {
				const result = await (target[key] as (...args: unknown[]) => Promise<unknown>).apply(target, args);
				if (!fired && matches(query)) { fired = true; await change(); }
				return result;
			};
			const value = Reflect.get(target, key);
			return typeof value === 'function' ? value.bind(target) : value;
		} });
		originals.set(proxy, statement);
		return proxy;
	};
	const platform = new Proxy(d1, { get(target, key) {
		if (key === 'prepare') return (query: string) => wrap(target.prepare(query), query);
		if (key === 'batch') return (statements: D1PreparedStatement[]) => target.batch(statements.map(statement => originals.get(statement) ?? statement));
		const value = Reflect.get(target, key);
		return typeof value === 'function' ? value.bind(target) : value;
	} });
	return { db: getDb(platform), fired: () => fired };
}

describe('scoring transitions against concurrent real D1 changes', { timeout: 20_000 }, () => {
	it('refuses finalization if a required score is cleared after the completeness read', async () => {
		const { d1, entryId } = await fixture();
		const race = afterRead(d1 as unknown as D1Database, query => query.includes('from "entries" left join "results"'), () => d1.prepare('UPDATE results SET score = NULL WHERE entry_id = ?').bind(entryId).run());
		await expect(finalizeContest(race.db, { contestId, actorUserId })).rejects.toMatchObject({ code: 'stale_contest' });
		expect(race.fired()).toBe(true);
		expect(await d1.prepare('SELECT lifecycle FROM contests WHERE id = ?').bind(contestId).first()).toMatchObject({ lifecycle: 'scoring' });
		expect(await d1.prepare("SELECT COUNT(*) n FROM audit_events WHERE action = 'contest_finalized'").first()).toEqual({ n: 0 });
	});

	it.each(['cell', 'knowdown', 'full', 'repository'] as const)('rejects %s writes when finalization wins after its first read', async (path) => {
		const { d1, entryId } = await fixture();
		const targetId = path === 'knowdown' ? String((await d1.prepare("SELECT id FROM entries WHERE contest_id = ? AND category = 'knowdown' LIMIT 1").bind(contestId).first())!.id) : entryId;
		const before = await d1.prepare('SELECT * FROM results WHERE entry_id = ?').bind(targetId).first();
		const race = afterRead(d1 as unknown as D1Database, query => query.includes('from "entries"'), () => d1.prepare("UPDATE contests SET lifecycle = 'finalized' WHERE id = ?").bind(contestId).run());
		const context = { contestId, entryId: targetId, actorUserId };
		const save = path === 'cell' ? saveScoreCell(race.db, { ...context, field: 'score', value: 73 })
			: path === 'knowdown' ? saveKnowdownPlace(race.db, { ...context, placement: 1 })
			: path === 'full' ? saveContestResult(race.db, { ...context, expectedVersion: Number(before?.version ?? 0), score: 73 })
			: saveResult(race.db, { ...context, expectedVersion: Number(before?.version ?? 0), score: 73, lastEditedBy: actorUserId });
		await expect(save).rejects.toMatchObject({ code: expect.stringMatching(/locked|stale_result/) });
		expect(race.fired()).toBe(true);
		expect(await d1.prepare('SELECT * FROM results WHERE entry_id = ?').bind(targetId).first()).toEqual(before);
		expect(await d1.prepare("SELECT COUNT(*) n FROM audit_events WHERE action IN ('score_saved', 'knowdown_place_saved')").first()).toEqual({ n: 0 });
	});

	it('does not publish when reopening wins after the publication read', async () => {
		const { d1, db } = await fixture();
		await finalizeContest(db, { contestId, actorUserId });
		const race = afterRead(d1 as unknown as D1Database, query => query.includes('from "contests"'), () => reopenContest(db, { contestId, actorUserId, reason: 'Correct a score' }));
		await expect(publishContestResults(race.db, { contestId, actorUserId })).rejects.toMatchObject({ code: 'stale_contest' });
		expect(race.fired()).toBe(true);
		expect(await d1.prepare('SELECT lifecycle, results_published_at FROM contests WHERE id = ?').bind(contestId).first()).toEqual({ lifecycle: 'scoring', results_published_at: null });
		expect(await d1.prepare("SELECT COUNT(*) n FROM audit_events WHERE action = 'results_published'").first()).toEqual({ n: 0 });
	});

	it('rolls back a score if its audit write fails', async () => {
		const { d1, db, entryId } = await fixture();
		const before = await d1.prepare('SELECT * FROM results WHERE entry_id = ?').bind(entryId).first();
		await d1.prepare("CREATE TRIGGER fail_score_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'score_saved' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END").run();
		await expect(saveContestResult(db, { contestId, entryId, actorUserId, expectedVersion: Number(before!.version), score: 73 })).rejects.toThrow();
		expect(await d1.prepare('SELECT * FROM results WHERE entry_id = ?').bind(entryId).first()).toEqual(before);
	});
});
