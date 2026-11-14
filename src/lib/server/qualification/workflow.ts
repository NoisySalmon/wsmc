import { and, eq, inArray, sql } from 'drizzle-orm';
import { schema, type Database } from '$lib/server/db';
import { previewStateCutoffs, type CutoffThresholds } from '$lib/qualification';
import { CutoffError, getQualificationPlanningData } from './cutoff-service';

// SQLite computes the same ordered fingerprint during reads and inside the commit
// batch, so a concurrent score correction cannot publish a stale reviewed list.
function qualificationSource(seasonId: string) {
	return sql<string>`(SELECT json_array(
		(SELECT json_group_array(json_array(id, lifecycle, scoring_revision)) FROM
			(SELECT id, lifecycle, scoring_revision FROM contests WHERE season_id = ${seasonId} AND kind = 'regional' ORDER BY id)),
		(SELECT json_group_array(json_array(id, entry_id, student_id, active)) FROM
			(SELECT q.id, q.entry_id, q.student_id, q.active FROM qualifications q JOIN qualification_rounds r ON r.id = q.round_id
			WHERE r.season_id = ${seasonId} AND r.kind = 'manual_review' ORDER BY q.id))))`;
}

function qualificationWorkspace(seasonId: string) {
	return sql<string>`(SELECT json_array(
		(SELECT json_group_array(json_array(id, kind, status, thresholds_json, source_revision)) FROM
			(SELECT id, kind, status, thresholds_json, source_revision FROM qualification_rounds WHERE season_id = ${seasonId} ORDER BY id)),
		(SELECT json_group_array(json_array(id, round_id, entry_id, student_id, active)) FROM
			(SELECT id, round_id, entry_id, student_id, active FROM qualifications WHERE season_id = ${seasonId} ORDER BY id))))`;
}

async function workspaceRevision(db: Database, seasonId: string) {
	const [row] = await db.select({ revision: qualificationWorkspace(seasonId) }).from(schema.seasons).where(eq(schema.seasons.id, seasonId));
	return row?.revision;
}

async function sourceRevision(db: Database, seasonId: string) {
	const [row] = await db.select({ revision: qualificationSource(seasonId) }).from(schema.seasons).where(eq(schema.seasons.id, seasonId));
	return row.revision;
}

function editableSeason(seasonId: string) {
	return sql`EXISTS (SELECT 1 FROM seasons WHERE id = ${seasonId} AND status = 'qualifications')
		AND NOT EXISTS (SELECT 1 FROM qualification_rounds WHERE season_id = ${seasonId} AND kind = 'state_cutoff' AND status = 'published')`;
}

async function commitDraft(db: Database, operations: [any, ...any[]]) {
	try { await db.batch(operations); }
	catch (cause) {
		const message = `${cause} ${(cause as Error)?.cause}`;
		if (message.includes('audit_events.details_json') || message.includes('qualification_rounds.season_id, qualification_rounds.kind')) {
			throw new CutoffError('stale_draft', 'Regional results or qualifications changed while saving. Save and review the draft again.');
		}
		throw cause;
	}
}

export async function getQualificationWorkflow(db: Database, seasonId: string) {
	const rounds = await db.select().from(schema.qualificationRounds).where(eq(schema.qualificationRounds.seasonId, seasonId));
	const cutoff = rounds.find(round => round.kind === 'state_cutoff');
	// Legacy frozen rounds are editable until the saved list is published.
	const status = cutoff?.status === 'published' ? 'published' : 'draft';
	return { status, rounds, thresholdsJson: cutoff?.thresholdsJson ?? null };
}

/** Save a complete snapshot in one transaction, including automatic placements. */
export async function saveQualificationDraft(db: Database, input: { seasonId: string; actorUserId: string; thresholds: CutoffThresholds }) {
	const workspace = await workspaceRevision(db, input.seasonId);
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, input.seasonId));
	if (!season || season.status !== 'qualifications') throw new CutoffError('locked', 'Qualifications can only be edited during qualification review.');
	const workflow = await getQualificationWorkflow(db, input.seasonId);
	if (workflow.status !== 'draft') throw new CutoffError('locked', 'Published qualifications are locked.');
	for (const divisionScores of Object.values(input.thresholds)) for (const value of (divisionScores !== null && typeof divisionScores === 'object' ? Object.values(divisionScores) : [divisionScores])) {
		if (value !== null && (!Number.isFinite(value) || value < 0)) throw new CutoffError('invalid_threshold', 'Cutoffs must be non-negative scores or blank.');
	}
	const revision = await sourceRevision(db, input.seasonId);
	const planning = await getQualificationPlanningData(db, input.seasonId);
	if (!planning.finalized) throw new CutoffError('incomplete', 'Finalize at least one regional before saving qualifications.');
	const now = Date.now();
	const operations: any[] = [db.insert(schema.auditEvents).values({
		id: crypto.randomUUID(), actorUserId: input.actorUserId, entityType: 'season', entityId: input.seasonId, action: 'qualification_draft_saved',
		detailsJson: sql`CASE WHEN ${editableSeason(input.seasonId)} AND ${qualificationWorkspace(input.seasonId)} = ${workspace} AND ${qualificationSource(input.seasonId)} = ${revision} THEN ${JSON.stringify({ thresholds: input.thresholds })} ELSE NULL END`, createdAt: now,
	})];
	const manualRound = workflow.rounds.find(round => round.kind === 'manual_review');
	const manual = manualRound ? await db.select().from(schema.qualifications).where(eq(schema.qualifications.roundId, manualRound.id)) : [];
	const overrides = new Map(manual.map(row => [row.entryId, row.active]));
	const cutoffCandidates = previewStateCutoffs(planning.rows, input.thresholds, new Set(planning.automaticEntryIds));
	for (const kind of ['regional_placements', 'state_cutoff'] as const) {
		const existing = workflow.rounds.find(round => round.kind === kind);
		// Old published placement rounds remain intact when adding the statewide draft.
		if (existing?.status === 'published') continue;
		const roundId = existing?.id ?? crypto.randomUUID();
		if (existing) operations.push(db.delete(schema.qualifications).where(eq(schema.qualifications.roundId, roundId)));
		else operations.push(db.insert(schema.qualificationRounds).values({ id: roundId, seasonId: input.seasonId, kind, createdBy: input.actorUserId, createdAt: now }));
		operations.push(db.update(schema.qualificationRounds).set({ status: 'draft', sourceRevision: revision, thresholdsJson: kind === 'state_cutoff' ? JSON.stringify(input.thresholds) : '{}' }).where(eq(schema.qualificationRounds.id, roundId)));
		const qualificationIds = new Map<string, string>();
		const decisions = kind === 'regional_placements' ? planning.decisions : cutoffCandidates.filter(row => row.added).map(row => ({ entryId: row.entryId, studentId: row.studentId, kind: 'state_cutoff' as const, active: true, rank: null, scope: 'overall' as const, actualGrade: null, threshold: row.threshold }));
		for (const decision of decisions) {
			// An explicit inclusion already has its own qualification record.
			if (overrides.get(decision.entryId) === true) continue;
			let id = qualificationIds.get(decision.entryId);
			if (!id) {
				id = crypto.randomUUID(); qualificationIds.set(decision.entryId, id);
				operations.push(db.insert(schema.qualifications).values({ id, roundId, seasonId: input.seasonId, entryId: decision.entryId, studentId: decision.studentId, active: overrides.get(decision.entryId) ?? decision.active, createdAt: now }));
			}
			operations.push(db.insert(schema.qualificationReasons).values({ id: crypto.randomUUID(), qualificationId: id, kind: decision.kind, rank: decision.rank, scope: decision.scope, actualGrade: decision.actualGrade, threshold: 'threshold' in decision ? decision.threshold : null, detailJson: '{}', createdAt: now }));
		}
	}
	if (manualRound && manualRound.status !== 'published') operations.push(db.update(schema.qualificationRounds).set({ status: 'draft' }).where(eq(schema.qualificationRounds.id, manualRound.id)));
	await commitDraft(db, operations as [any, ...any[]]);
}

/** Publish the saved snapshot and advance the season atomically. */
export async function publishQualificationDraft(db: Database, input: { seasonId: string; actorUserId: string }) {
	const workspace = await workspaceRevision(db, input.seasonId);
	const workflow = await getQualificationWorkflow(db, input.seasonId);
	if (workflow.status === 'published') throw new CutoffError('locked', 'Qualifications are already published.');
	if (!workflow.rounds.some(round => round.kind === 'state_cutoff') || !workflow.rounds.some(round => round.kind === 'regional_placements')) throw new CutoffError('not_saved', 'Save the complete qualification draft before publishing.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, input.seasonId));
	if (season?.status !== 'qualifications') throw new CutoffError('locked', 'Publish qualifications during the qualification stage.');
	const regionals = await db.select({ lifecycle: schema.contests.lifecycle }).from(schema.contests).where(and(eq(schema.contests.seasonId, input.seasonId), eq(schema.contests.kind, 'regional')));
	if (!regionals.length || regionals.some(contest => contest.lifecycle !== 'finalized')) throw new CutoffError('incomplete', 'Finalize all regionals before publishing qualifications.');
	// Exceptions are recorded separately; require Save to apply them to the
	// complete list before exposing it to state registration.
	const saved = await db.select({ qualification: schema.qualifications, kind: schema.qualificationRounds.kind }).from(schema.qualifications).innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId)).where(eq(schema.qualificationRounds.seasonId, input.seasonId));
	for (const { qualification: manual } of saved.filter(row => row.kind === 'manual_review')) {
		const others = saved.filter(row => row.kind !== 'manual_review' && row.qualification.entryId === manual.entryId);
		if ((manual.active && others.length) || (!manual.active && others.some(row => row.qualification.active))) throw new CutoffError('unsaved_changes', 'Save the draft to apply manual exceptions before publishing.');
	}
	const revision = await sourceRevision(db, input.seasonId);
	const draft = workflow.rounds.find(round => round.kind === 'state_cutoff')!;
	if (draft.sourceRevision !== revision) throw new CutoffError('stale_draft', 'Regional results or manual exceptions changed since this draft was saved. Save and review the draft again before publishing.');
	const now = Date.now();
	await commitDraft(db, [
		db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, entityType: 'season', entityId: input.seasonId, action: 'qualifications_published',
			detailsJson: sql`CASE WHEN ${editableSeason(input.seasonId)} AND ${qualificationWorkspace(input.seasonId)} = ${workspace} AND ${qualificationSource(input.seasonId)} = ${revision}
			AND EXISTS (SELECT 1 FROM qualification_rounds WHERE id = ${draft.id} AND source_revision = ${revision})
			THEN '{}' ELSE NULL END`, createdAt: now }),
		db.update(schema.qualificationRounds).set({ status: 'published', publishedAt: now }).where(and(eq(schema.qualificationRounds.seasonId, input.seasonId), inArray(schema.qualificationRounds.status, ['draft', 'frozen']))),
		db.update(schema.seasons).set({ status: 'state', updatedAt: now }).where(eq(schema.seasons.id, input.seasonId)),
		db.update(schema.contests).set({ lifecycle: 'registration_open', updatedAt: now }).where(and(eq(schema.contests.seasonId, input.seasonId), eq(schema.contests.kind, 'state'), eq(schema.contests.lifecycle, 'setup'))),
	]);
}
