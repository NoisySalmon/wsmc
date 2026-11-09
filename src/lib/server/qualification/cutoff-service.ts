import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { getRegionalRankings, ScoringError } from '$lib/server/scoring/service';
import type { RegionalResultRow } from '$lib/server/scoring/rankings';
import { buildRegionalPlacementDecisions, type QualificationDecision } from './rules';

export class CutoffError extends Error {
	constructor(public readonly code: string, message: string) { super(message); this.name = 'CutoffError'; }
}

/** Read-only planning works before any qualification draft has been generated. */
export async function getQualificationPlanningData(db: Database, seasonId: string) {
	const contests = await db.select().from(schema.contests).where(and(eq(schema.contests.seasonId, seasonId), eq(schema.contests.kind, 'regional')));
	const rows: RegionalResultRow[] = [];
	const automaticEntryIds = new Set<string>();
	const decisions: QualificationDecision[] = [];
	for (const contest of contests.filter((contest) => contest.lifecycle === 'finalized')) {
		try {
			const { rankings } = await getRegionalRankings(db, contest.id);
			for (const category of Object.values(rankings)) rows.push(...category);
			const regionalDecisions = buildRegionalPlacementDecisions(rankings);
			decisions.push(...regionalDecisions);
			for (const decision of regionalDecisions) if (decision.active) automaticEntryIds.add(decision.entryId);
		} catch (cause) {
			if (cause instanceof ScoringError) throw new CutoffError(cause.code, cause.message);
			throw cause;
		}
	}
	// Preserve any frozen placement decisions if scores were subsequently corrected.
	const saved = await db.select({ entryId: schema.qualifications.entryId }).from(schema.qualifications)
		.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
		.where(and(eq(schema.qualificationRounds.seasonId, seasonId), eq(schema.qualificationRounds.kind, 'regional_placements'), eq(schema.qualificationRounds.status, 'published'), eq(schema.qualifications.active, true)));
	for (const row of saved) automaticEntryIds.add(row.entryId);
	const members = await db.select({ entryId: schema.entryMembers.entryId, studentId: schema.entryMembers.annualStudentId, studentName: schema.annualStudents.name })
		.from(schema.entryMembers).innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.entryMembers.annualStudentId)).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId))
		.innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId)).where(and(eq(schema.contests.seasonId, seasonId), eq(schema.contests.kind, 'regional')));
	return { rows, decisions, automaticEntryIds: [...automaticEntryIds], members, finalized: contests.filter((contest) => contest.lifecycle === 'finalized').length, total: contests.length };
}

export async function recordManualQualificationDecision(db: Database, input: { seasonId: string; entryId: string; studentId?: string | null; include: boolean; reason: string; actorUserId: string; now?: number }) {
	const locked = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, input.seasonId), eq(schema.qualificationRounds.status, 'frozen')));
	if (locked.length) throw new CutoffError('frozen', 'The qualification draft is frozen.');
	const reason = input.reason.trim();
	if (!reason) throw new CutoffError('reason_required', 'A reason is required for a manual qualification decision.');
	const [entry] = await db.select({ entry: schema.entries, contest: schema.contests }).from(schema.entries).innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId)).where(and(eq(schema.entries.id, input.entryId), eq(schema.contests.seasonId, input.seasonId)));
	if (!entry || entry.contest.kind !== 'regional' || entry.contest.lifecycle !== 'finalized') throw new CutoffError('entry_out_of_scope', 'Manual decisions require an entry from a finalized regional contest in this season.');
	if (input.studentId) {
		const [member] = await db.select().from(schema.entryMembers).where(and(eq(schema.entryMembers.entryId, input.entryId), eq(schema.entryMembers.annualStudentId, input.studentId)));
		if (!member) throw new CutoffError('student_out_of_scope', 'Student is not a member of this entry.');
	}
	const [round] = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, input.seasonId), eq(schema.qualificationRounds.kind, 'manual_review'))).orderBy(asc(schema.qualificationRounds.createdAt));
	if (round && round.status !== 'draft') throw new CutoffError('published', 'Published manual qualification decisions are frozen.');
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
