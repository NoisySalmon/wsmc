import { and, eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { validateScoreInput } from './service';
import { exportScoreCsv, parseScoreCsv, scoreCsvFormat, type ScoreCsvEntry, type ScoreCsvPreview, validateScoreCsv, ScoreCsvError } from './csv';

export class ScoreCsvValidationError extends ScoreCsvError {
	constructor(public readonly preview: ScoreCsvPreview) { super('validation_failed', `The CSV has ${preview.errors.length} validation error${preview.errors.length === 1 ? '' : 's'}.`); }
}

async function scope(db: Database, contestId: string) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	if (!contest || !['regional', 'state'].includes(contest.kind)) throw new ScoreCsvError('not_found', 'Scoring contest not found.');
	if (!['roster_locked', 'scoring', 'finalized'].includes(contest.lifecycle)) throw new ScoreCsvError('locked', 'Scores are not available until the roster is locked.');
	return contest;
}

async function entriesSnapshot(db: Database, contestId: string): Promise<ScoreCsvEntry[]> {
	const rows = await db.select({ entry: schema.entries, result: schema.results, schoolName: schema.schools.shortName, schoolFullName: schema.schools.name })
		.from(schema.entries).leftJoin(schema.results, eq(schema.results.entryId, schema.entries.id)).leftJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId)).where(eq(schema.entries.contestId, contestId));
	return rows.map(({ entry, result, schoolName, schoolFullName }) => ({
		...(() => { const part1 = result?.part1 ?? null; const part2 = result?.part2 ?? null; return { score: result?.score ?? (part1 !== null && part2 !== null ? part1 + part2 : null), part1, part2 }; })(),
		id: entry.id, category: entry.category, division: entry.division, entryNumber: entry.entryNumber, schoolName: schoolName || schoolFullName || 'Statewide entry',
		placement: result?.placement ?? null, version: result?.version ?? 0,
	}));
}

export async function exportScoreCsvFromDb(db: Database, contestId: string) { await scope(db, contestId); return exportScoreCsv(await entriesSnapshot(db, contestId)); }

export async function previewScoreCsv(db: Database, contestId: string, text: string) {
	await scope(db, contestId);
	return validateScoreCsv(parseScoreCsv(text), await entriesSnapshot(db, contestId));
}

export async function importScoreCsv(db: Database, input: { contestId: string; actorUserId: string; text: string; now?: number }) {
	const contest = await scope(db, input.contestId);
	if (contest.lifecycle !== 'scoring') throw new ScoreCsvError('locked', 'Score imports are only allowed while the contest is in scoring.');
	const entries = await entriesSnapshot(db, input.contestId);
	const rows = parseScoreCsv(input.text);
	const preview = validateScoreCsv(rows, entries);
	if (preview.errors.length > 0) throw new ScoreCsvValidationError(preview);
	const now = input.now ?? Date.now();
	const operations: any[] = [];
	for (const row of rows) {
		const values = validateScoreInput(row.category, { ...row, score: null });
		const current = entries.find((entry) => entry.id === row.id)!;
		if (row.version === 0 && values.score === null && values.part1 === null && values.part2 === null && values.placement === null) continue;
		if (row.version === 0) {
			operations.push(db.insert(schema.results).values({ entryId: row.id, score: values.score, part1: values.part1, part2: values.part2, placement: values.placement, version: 1, lastEditedBy: input.actorUserId, updatedAt: now }));
		} else {
			operations.push(db.update(schema.results).set({ score: values.score, part1: values.part1, part2: values.part2, placement: values.placement, version: row.version + 1, lastEditedBy: input.actorUserId, updatedAt: now }).where(and(eq(schema.results.entryId, row.id), eq(schema.results.version, current.version))));
		}
	}
	operations.push(db.insert(schema.imports).values({ id: crypto.randomUUID(), contestId: input.contestId, schoolId: null, kind: 'score', filename: 'score-import.csv', status: 'committed', createdBy: input.actorUserId, createdAt: now }));
	operations.push(db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'score_import', entityId: input.contestId, action: 'score_csv_imported', detailsJson: JSON.stringify({ format: scoreCsvFormat, rows: rows.length, updatedRows: preview.updatedRows, clearedRows: preview.clearedRows }), createdAt: now }));
	const [publishedQualificationRound] = await db.select({ id: schema.qualificationRounds.id }).from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, contest.seasonId), eq(schema.qualificationRounds.status, 'published'))).limit(1);
	if (publishedQualificationRound) operations.push(db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'qualification_round', entityId: publishedQualificationRound.id, action: 'qualification_impact_review_required', detailsJson: JSON.stringify({ reason: 'score_csv_changed_after_qualification_publication', rows: rows.length }), createdAt: now }));
	await db.batch(operations as [any, ...any[]]);
	return preview;
}
