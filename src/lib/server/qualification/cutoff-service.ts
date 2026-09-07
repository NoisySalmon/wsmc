import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { getRegionalRankings, ScoringError } from '$lib/server/scoring/service';
import type { RegionalResultRow } from '$lib/server/scoring/rankings';
import { previewStateCutoffs, type CutoffThresholds } from './cutoffs';

export class CutoffError extends Error {
	constructor(public readonly code: string, message: string) { super(message); this.name = 'CutoffError'; }
}

async function finalizedRows(db: Database, seasonId: string): Promise<RegionalResultRow[]> {
	const contests = await db.select().from(schema.contests).where(and(eq(schema.contests.seasonId, seasonId), eq(schema.contests.kind, 'regional'), eq(schema.contests.lifecycle, 'finalized')));
	const rows: RegionalResultRow[] = [];
	for (const contest of contests) {
		try {
			const result = await getRegionalRankings(db, contest.id);
			for (const category of Object.values(result.rankings)) rows.push(...category);
		} catch (cause) {
			if (cause instanceof ScoringError) throw new CutoffError(cause.code, cause.message);
			throw cause;
		}
	}
	return rows;
}

async function placementIds(db: Database, seasonId: string): Promise<Set<string>> {
	const [round] = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, seasonId), eq(schema.qualificationRounds.kind, 'regional_placements'))).orderBy(asc(schema.qualificationRounds.createdAt));
	if (!round) return new Set();
	const rows = await db.select({ entryId: schema.qualifications.entryId }).from(schema.qualifications).where(and(eq(schema.qualifications.roundId, round.id), eq(schema.qualifications.active, true)));
	return new Set(rows.map((row) => row.entryId));
}

export async function previewStateCutoffRound(db: Database, input: { seasonId: string; thresholds: CutoffThresholds }) {
	return previewStateCutoffs(await finalizedRows(db, input.seasonId), input.thresholds, await placementIds(db, input.seasonId));
}

export async function createStateCutoffDraft(db: Database, input: { seasonId: string; actorUserId: string; thresholds: CutoffThresholds; now?: number }) {
	const [existingRound] = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, input.seasonId), eq(schema.qualificationRounds.kind, 'state_cutoff'))).orderBy(asc(schema.qualificationRounds.createdAt));
	if (existingRound?.status === 'published') throw new CutoffError('published', 'Published score cutoffs are frozen.');
	const round = existingRound ?? { id: crypto.randomUUID(), status: 'draft' as const };
	const candidates = await previewStateCutoffRound(db, input);
	const existing = existingRound ? await db.select().from(schema.qualifications).where(eq(schema.qualifications.roundId, existingRound.id)) : [];
	const byEntry = new Map(existing.map((qualification) => [qualification.entryId, qualification]));
	const operations: any[] = [];
	const now = input.now ?? Date.now();
	if (!existingRound) operations.push(db.insert(schema.qualificationRounds).values({ id: round.id, seasonId: input.seasonId, kind: 'state_cutoff', status: 'draft', thresholdsJson: JSON.stringify(input.thresholds), createdBy: input.actorUserId, createdAt: now }));
	for (const candidate of candidates.filter((candidate) => candidate.added)) {
		if (byEntry.has(candidate.entryId)) continue;
		const qualification = { id: crypto.randomUUID(), roundId: round.id, seasonId: input.seasonId, entryId: candidate.entryId, studentId: candidate.studentId, active: true, createdAt: now };
		byEntry.set(candidate.entryId, qualification);
		operations.push(db.insert(schema.qualifications).values(qualification));
		operations.push(db.insert(schema.qualificationReasons).values({ id: crypto.randomUUID(), qualificationId: qualification.id, kind: 'state_cutoff', rank: null, scope: 'overall', actualGrade: null, threshold: candidate.threshold, detailJson: JSON.stringify({ category: candidate.category, division: candidate.division }), createdAt: now }));
	}
	operations.push(db.update(schema.qualificationRounds).set({ thresholdsJson: JSON.stringify(input.thresholds) }).where(eq(schema.qualificationRounds.id, round.id)));
	operations.push(db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, entityType: 'qualification_round', entityId: round.id, action: 'state_cutoff_draft_generated', detailsJson: JSON.stringify({ candidates: candidates.length, additions: candidates.filter((candidate) => candidate.added).length }), createdAt: now }));
	await db.batch(operations as [any, ...any[]]);
	return { candidates, roundId: round.id };
}

export async function publishStateCutoffRound(db: Database, input: { seasonId: string; actorUserId: string; now?: number }) {
	const [round] = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, input.seasonId), eq(schema.qualificationRounds.kind, 'state_cutoff'))).orderBy(asc(schema.qualificationRounds.createdAt));
	if (!round) throw new CutoffError('not_found', 'Generate a score-cutoff draft before publishing.');
	if (round.status !== 'draft') throw new CutoffError('published', 'Score cutoffs are already published.');
	const now = input.now ?? Date.now();
	await db.update(schema.qualificationRounds).set({ status: 'published', publishedAt: now }).where(and(eq(schema.qualificationRounds.id, round.id), eq(schema.qualificationRounds.status, 'draft')));
	await db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), entityType: 'qualification_round', entityId: round.id, action: 'state_cutoffs_published', detailsJson: JSON.stringify({ seasonId: input.seasonId }), createdAt: now, actorUserId: input.actorUserId });
}

export async function publishManualQualificationReview(db: Database, input: { seasonId: string; actorUserId: string; now?: number }) {
	const [round] = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, input.seasonId), eq(schema.qualificationRounds.kind, 'manual_review'))).orderBy(asc(schema.qualificationRounds.createdAt));
	if (!round) throw new CutoffError('not_found', 'Record a manual decision before publishing this review.');
	if (round.status !== 'draft') throw new CutoffError('published', 'Manual qualification decisions are already published.');
	const now = input.now ?? Date.now();
	await db.update(schema.qualificationRounds).set({ status: 'published', publishedAt: now }).where(and(eq(schema.qualificationRounds.id, round.id), eq(schema.qualificationRounds.status, 'draft')));
	await db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, entityType: 'qualification_round', entityId: round.id, action: 'manual_qualifications_published', detailsJson: JSON.stringify({ seasonId: input.seasonId }), createdAt: now });
}

export async function recordManualQualificationDecision(db: Database, input: { seasonId: string; entryId: string; studentId?: string | null; include: boolean; reason: string; actorUserId: string; now?: number }) {
	const reason = input.reason.trim();
	if (!reason) throw new CutoffError('reason_required', 'A reason is required for a manual qualification decision.');
	const [entry] = await db.select({ entry: schema.entries, contest: schema.contests }).from(schema.entries).innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId)).where(and(eq(schema.entries.id, input.entryId), eq(schema.contests.seasonId, input.seasonId)));
	if (!entry || entry.contest.kind !== 'regional' || entry.contest.lifecycle !== 'finalized') throw new CutoffError('entry_out_of_scope', 'Manual decisions require an entry from a finalized regional contest in this season.');
	if (input.studentId) {
		const [member] = await db.select().from(schema.entryMembers).where(and(eq(schema.entryMembers.entryId, input.entryId), eq(schema.entryMembers.annualStudentId, input.studentId)));
		if (!member) throw new CutoffError('student_out_of_scope', 'Student is not a member of this entry.');
	}
	const [round] = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, input.seasonId), eq(schema.qualificationRounds.kind, 'manual_review'))).orderBy(asc(schema.qualificationRounds.createdAt));
	if (round?.status === 'published') throw new CutoffError('published', 'Published manual qualification decisions are frozen.');
	const manualRound = round ?? { id: crypto.randomUUID() };
	const [existing] = round ? await db.select().from(schema.qualifications).where(and(eq(schema.qualifications.roundId, round.id), eq(schema.qualifications.entryId, input.entryId))) : [];
	const now = input.now ?? Date.now();
	const operations: any[] = [];
	if (!round) operations.push(db.insert(schema.qualificationRounds).values({ id: manualRound.id, seasonId: input.seasonId, kind: 'manual_review', status: 'draft', thresholdsJson: '{}', createdBy: input.actorUserId, createdAt: now }));
	const qualificationId = existing?.id ?? crypto.randomUUID();
	if (existing) operations.push(db.update(schema.qualifications).set({ active: input.include }).where(eq(schema.qualifications.id, existing.id)));
	else operations.push(db.insert(schema.qualifications).values({ id: qualificationId, roundId: manualRound.id, seasonId: input.seasonId, entryId: input.entryId, studentId: input.studentId ?? null, active: input.include, createdAt: now }));
	operations.push(db.insert(schema.qualificationReasons).values({ id: crypto.randomUUID(), qualificationId, kind: input.include ? 'manual_include' : 'manual_exclude', rank: null, scope: 'overall', actualGrade: null, threshold: null, detailJson: JSON.stringify({ reason }), createdAt: now }));
	operations.push(db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, entityType: 'qualification', entityId: qualificationId, action: input.include ? 'qualification_manually_included' : 'qualification_manually_excluded', detailsJson: JSON.stringify({ reason, seasonId: input.seasonId }), createdAt: now }));
	await db.batch(operations as [any, ...any[]]);
}
