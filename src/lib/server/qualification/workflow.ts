import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '$lib/server/db';
import { previewStateCutoffs, type CutoffThresholds } from '$lib/qualification';
import { CutoffError, getQualificationPlanningData } from './cutoff-service';

export async function getQualificationWorkflow(db: Database, seasonId: string) {
	const rounds = await db.select().from(schema.qualificationRounds).where(eq(schema.qualificationRounds.seasonId, seasonId));
	const cutoff = rounds.find(round => round.kind === 'state_cutoff');
	const status = rounds.some(round => round.status === 'frozen') ? 'frozen'
		: cutoff && rounds.every(round => round.status === 'published') ? 'published' : 'draft';
	return { status, rounds, thresholdsJson: cutoff?.thresholdsJson ?? null };
}

/** Save a complete snapshot in one transaction, including automatic placements. */
export async function saveQualificationDraft(db: Database, input: { seasonId: string; actorUserId: string; thresholds: CutoffThresholds; freeze?: boolean }) {
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, input.seasonId));
	if (!season || !['regional', 'qualifications'].includes(season.status)) throw new CutoffError('locked', 'Qualifications can only be edited before the state contest opens.');
	const workflow = await getQualificationWorkflow(db, input.seasonId);
	if (workflow.status !== 'draft') throw new CutoffError('locked', 'Qualifications are frozen.');
	for (const divisionScores of Object.values(input.thresholds)) for (const value of Object.values(divisionScores)) {
		if (value !== null && (!Number.isFinite(value) || value < 0)) throw new CutoffError('invalid_threshold', 'Cutoffs must be non-negative scores or blank.');
	}
	const planning = await getQualificationPlanningData(db, input.seasonId);
	if (!planning.finalized) throw new CutoffError('incomplete', 'Finalize at least one regional before saving qualifications.');
	if (input.freeze && (planning.finalized !== planning.total || season.status !== 'qualifications')) throw new CutoffError('incomplete', 'Finalize all regionals and begin the qualification stage before freezing.');
	const now = Date.now();
	const operations: any[] = [];
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
		operations.push(db.update(schema.qualificationRounds).set({ status: input.freeze ? 'frozen' : 'draft', thresholdsJson: kind === 'state_cutoff' ? JSON.stringify(input.thresholds) : '{}' }).where(eq(schema.qualificationRounds.id, roundId)));
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
	if (manualRound && manualRound.status === 'draft' && input.freeze) operations.push(db.update(schema.qualificationRounds).set({ status: 'frozen' }).where(eq(schema.qualificationRounds.id, manualRound.id)));
	operations.push(db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, entityType: 'season', entityId: input.seasonId, action: input.freeze ? 'qualifications_frozen' : 'qualification_draft_saved', detailsJson: JSON.stringify({ thresholds: input.thresholds }), createdAt: now }));
	await db.batch(operations as [any, ...any[]]);
}

/** Publish the frozen snapshot and advance the season atomically. */
export async function publishQualificationDraft(db: Database, input: { seasonId: string; actorUserId: string }) {
	const workflow = await getQualificationWorkflow(db, input.seasonId);
	if (workflow.status !== 'frozen' || workflow.rounds.some(round => round.status === 'draft')) throw new CutoffError('not_frozen', 'Freeze the complete qualification draft before publishing.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, input.seasonId));
	if (season?.status !== 'qualifications') throw new CutoffError('locked', 'Publish qualifications during the qualification stage.');
	const now = Date.now();
	await db.batch([
		db.update(schema.qualificationRounds).set({ status: 'published', publishedAt: now }).where(and(eq(schema.qualificationRounds.seasonId, input.seasonId), eq(schema.qualificationRounds.status, 'frozen'))),
		db.update(schema.seasons).set({ status: 'state', updatedAt: now }).where(eq(schema.seasons.id, input.seasonId)),
		db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, entityType: 'season', entityId: input.seasonId, action: 'qualifications_published', detailsJson: '{}', createdAt: now }),
	]);
}
