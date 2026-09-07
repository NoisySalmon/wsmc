import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { getRegionalRankings, ScoringError } from '$lib/server/scoring/service';
import { buildRegionalPlacementDecisions, type QualificationDecision } from './rules';

export class QualificationError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'QualificationError';
	}
}

async function requireFinalizedRegional(db: Database, contestId: string) {
	try {
		return await getRegionalRankings(db, contestId);
	} catch (cause) {
		if (cause instanceof ScoringError) throw new QualificationError(cause.code, cause.message);
		throw cause;
	}
}

export async function generateRegionalPlacementQualifications(db: Database, input: { contestId: string; actorUserId: string; now?: number }) {
	const { contest, rankings } = await requireFinalizedRegional(db, input.contestId);
	const [existingRound] = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, contest.seasonId), eq(schema.qualificationRounds.kind, 'regional_placements'))).orderBy(asc(schema.qualificationRounds.createdAt));
	if (existingRound?.status === 'published') throw new QualificationError('published', 'Published regional qualifications are frozen.');
	const round = existingRound ?? { id: crypto.randomUUID(), seasonId: contest.seasonId, kind: 'regional_placements' as const, status: 'draft' as const };
	const decisions = buildRegionalPlacementDecisions(rankings);
	const existingQualifications = existingRound ? await db.select().from(schema.qualifications).where(eq(schema.qualifications.roundId, existingRound.id)) : [];
	const qualificationsByEntry = new Map(existingQualifications.map((qualification) => [qualification.entryId, qualification]));
	const operations: any[] = [];
	if (!existingRound) operations.push(db.insert(schema.qualificationRounds).values({ id: round.id, seasonId: contest.seasonId, kind: 'regional_placements', status: 'draft', thresholdsJson: '{}', createdBy: input.actorUserId, createdAt: input.now ?? Date.now() }));
	for (const decision of decisions) {
		let qualification = qualificationsByEntry.get(decision.entryId);
		if (!qualification) {
			const newQualification = { id: crypto.randomUUID(), roundId: round.id, seasonId: contest.seasonId, entryId: decision.entryId, studentId: decision.studentId, active: decision.active, createdAt: input.now ?? Date.now() };
			qualification = newQualification;
			qualificationsByEntry.set(decision.entryId, newQualification);
			operations.push(db.insert(schema.qualifications).values(newQualification));
		} else if (decision.active && !qualification.active) {
			qualification.active = true;
			operations.push(db.update(schema.qualifications).set({ active: true }).where(eq(schema.qualifications.id, qualification.id)));
		}
	}
	const qualificationIds = [...qualificationsByEntry.values()].map((qualification) => qualification.id);
	const existingReasons = qualificationIds.length ? await db.select().from(schema.qualificationReasons).where(inArray(schema.qualificationReasons.qualificationId, qualificationIds)) : [];
	const reasonKeys = new Set(existingReasons.map((reason) => `${reason.qualificationId}:${reason.kind}:${reason.scope ?? ''}:${reason.actualGrade ?? ''}`));
	for (const decision of decisions) {
		const qualification = qualificationsByEntry.get(decision.entryId)!;
		const key = `${qualification.id}:${decision.kind}:${decision.scope ?? ''}:${decision.actualGrade ?? ''}`;
		if (reasonKeys.has(key)) continue;
		reasonKeys.add(key);
		operations.push(db.insert(schema.qualificationReasons).values({ id: crypto.randomUUID(), qualificationId: qualification.id, kind: decision.kind, rank: decision.rank, scope: decision.scope, actualGrade: decision.actualGrade, threshold: null, detailJson: JSON.stringify({ contestId: input.contestId }), createdAt: input.now ?? Date.now() }));
	}
	operations.push(db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'qualification_round', entityId: round.id, action: 'regional_qualifications_generated', detailsJson: JSON.stringify({ decisions: decisions.length, roundId: round.id }), createdAt: input.now ?? Date.now() }));
	await db.batch(operations as [any, ...any[]]);
	return getQualificationReview(db, contest.seasonId);
}

export async function getQualificationRoundReview(db: Database, seasonId: string, kind: 'regional_placements' | 'state_cutoff' | 'manual_review') {
	const [round] = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, seasonId), eq(schema.qualificationRounds.kind, kind))).orderBy(asc(schema.qualificationRounds.createdAt));
	if (!round) return { round: null, qualifications: [] };
	const rows = await db.select({ qualification: schema.qualifications, entry: schema.entries, schoolName: schema.schools.shortName, studentName: schema.annualStudents.name })
		.from(schema.qualifications).innerJoin(schema.entries, eq(schema.entries.id, schema.qualifications.entryId)).leftJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId)).leftJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.qualifications.studentId)).where(eq(schema.qualifications.roundId, round.id));
	const qualificationIds = rows.map((row) => row.qualification.id);
	const reasons = qualificationIds.length ? await db.select().from(schema.qualificationReasons).where(inArray(schema.qualificationReasons.qualificationId, qualificationIds)) : [];
	return { round, qualifications: rows.map(({ qualification, entry, schoolName, studentName }) => ({ ...qualification, category: entry.category, entryNumber: entry.entryNumber, division: entry.division, schoolName: schoolName || 'Statewide entry', studentName: studentName || null, reasons: reasons.filter((reason) => reason.qualificationId === qualification.id) })) };
}

export async function getQualificationReview(db: Database, seasonId: string) {
	return getQualificationRoundReview(db, seasonId, 'regional_placements');
}

export async function publishRegionalQualifications(db: Database, input: { seasonId: string; actorUserId: string; now?: number }) {
	const { round } = await getQualificationReview(db, input.seasonId);
	if (!round) throw new QualificationError('not_found', 'Generate regional qualifications before publishing.');
	if (round.status !== 'draft') throw new QualificationError('published', 'Regional qualifications are already published.');
	const now = input.now ?? Date.now();
	await db.update(schema.qualificationRounds).set({ status: 'published', publishedAt: now }).where(and(eq(schema.qualificationRounds.id, round.id), eq(schema.qualificationRounds.status, 'draft')));
	await db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, entityType: 'qualification_round', entityId: round.id, action: 'regional_qualifications_published', detailsJson: JSON.stringify({ seasonId: input.seasonId }), createdAt: now });
}
