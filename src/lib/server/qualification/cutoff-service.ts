import { activeEntry } from '$lib/server/program/participation';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { rankRegionalResults, type RegionalResultRow } from '$lib/server/scoring/rankings';
import { buildRegionalPlacementDecisions, type QualificationDecision } from './rules';

export class CutoffError extends Error {
	constructor(public readonly code: string, message: string) { super(message); this.name = 'CutoffError'; }
}

/** Read-only planning works before any qualification draft has been generated. */
export async function getQualificationPlanningData(db: Database, seasonId: string) {
	const contests = await db.select({ id: schema.contests.id, lifecycle: schema.contests.lifecycle, regionNumber: schema.regions.number, regionName: schema.regions.name }).from(schema.contests).leftJoin(schema.regions, eq(schema.regions.id, schema.contests.regionId)).where(and(eq(schema.contests.seasonId, seasonId), eq(schema.contests.kind, 'regional')));
	const rows: (RegionalResultRow & { regionNumber: number | null; regionName: string | null })[] = [];
	const automaticEntryIds = new Set<string>();
	const decisions: QualificationDecision[] = [];
	// Read the season once instead of loading each regional's full scoring page.
	const resultRows = await db.select({ entry: schema.entries, result: schema.results, schoolName: schema.schools.shortName, schoolFullName: schema.schools.name })
		.from(schema.entries).innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId))
		.leftJoin(schema.results, eq(schema.results.entryId, schema.entries.id)).leftJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId))
		.where(and(eq(schema.contests.seasonId, seasonId), eq(schema.contests.kind, 'regional'), eq(schema.contests.lifecycle, 'finalized'), activeEntry()))
		.orderBy(asc(schema.entries.category), asc(schema.entries.division), asc(schema.entries.entryNumber));
	const members = await db.select({ entryId: schema.entryMembers.entryId, studentId: schema.entryMembers.annualStudentId, studentName: schema.annualStudents.name, actualGrade: schema.annualStudents.actualGrade, schoolName: schema.schools.shortName })
		.from(schema.entryMembers).innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.entryMembers.annualStudentId)).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId))
		.innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId)).innerJoin(schema.schools, eq(schema.schools.id, schema.annualStudents.schoolId))
		.where(and(eq(schema.contests.seasonId, seasonId), eq(schema.contests.kind, 'regional'), activeEntry()));
	const membersByEntry = new Map<string, typeof members>();
	for (const member of members) {
		const group = membersByEntry.get(member.entryId) ?? [];
		group.push(member); membersByEntry.set(member.entryId, group);
	}
	const rowsByContest = new Map<string, RegionalResultRow[]>();
	for (const { entry, result, schoolName, schoolFullName } of resultRows) {
		const entryMembers = membersByEntry.get(entry.id) ?? [];
		const individual = entry.category === 'topical_individual' || entry.category === 'knowdown';
		const part1 = result?.part1 ?? null, part2 = result?.part2 ?? null;
		const row: RegionalResultRow = {
			entryId: entry.id, category: entry.category, division: entry.division, entryNumber: entry.entryNumber,
			schoolName: schoolName || schoolFullName || [...new Set(entryMembers.map(member => member.schoolName).filter(Boolean))].join(' / ') || 'Statewide entry',
			score: result?.score ?? (part1 !== null && part2 !== null ? part1 + part2 : null), part1, part2, placement: result?.placement ?? null,
			studentId: individual ? entryMembers[0]?.studentId ?? null : null, studentName: individual ? entryMembers[0]?.studentName ?? null : null,
			actualGrade: entry.category === 'topical_individual' ? entryMembers[0]?.actualGrade ?? null : null,
		};
		const group = rowsByContest.get(entry.contestId) ?? [];
		group.push(row); rowsByContest.set(entry.contestId, group);
	}
	for (const contest of contests.filter(contest => contest.lifecycle === 'finalized')) {
		const rankings = rankRegionalResults(rowsByContest.get(contest.id) ?? []);
		for (const category of Object.values(rankings)) rows.push(...category.map(row => ({ ...row, regionNumber: contest.regionNumber, regionName: contest.regionName })));
		const regionalDecisions = buildRegionalPlacementDecisions(rankings);
		decisions.push(...regionalDecisions);
		for (const decision of regionalDecisions) if (decision.active) automaticEntryIds.add(decision.entryId);
	}
	// Preserve any published placement decisions if scores were subsequently corrected.
	const saved = await db.select({ entryId: schema.qualifications.entryId }).from(schema.qualifications)
		.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
		.where(and(eq(schema.qualificationRounds.seasonId, seasonId), eq(schema.qualificationRounds.kind, 'regional_placements'), eq(schema.qualificationRounds.status, 'published'), eq(schema.qualifications.active, true)));
	for (const row of saved) automaticEntryIds.add(row.entryId);
	return { rows, decisions, automaticEntryIds: [...automaticEntryIds], members: members.map(({ entryId, studentId, studentName }) => ({ entryId, studentId, studentName })), finalized: contests.filter((contest) => contest.lifecycle === 'finalized').length, total: contests.length };
}

export async function recordManualQualificationDecision(db: Database, input: { seasonId: string; entryId: string; studentId?: string | null; include: boolean; reason: string; actorUserId: string; now?: number }) {
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, input.seasonId));
	if (!season || season.status !== 'qualifications') throw new CutoffError('locked', 'Qualifications can only be edited during qualification review.');
	const locked = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, input.seasonId), eq(schema.qualificationRounds.kind, 'state_cutoff'), eq(schema.qualificationRounds.status, 'published')));
	if (locked.length) throw new CutoffError('locked', 'Published qualifications are locked.');
	const reason = input.reason.trim();
	if (!reason) throw new CutoffError('reason_required', 'A reason is required for a manual qualification decision.');
	const [entry] = await db.select({ entry: schema.entries, contest: schema.contests }).from(schema.entries).innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId)).where(and(activeEntry(), eq(schema.entries.id, input.entryId), eq(schema.contests.seasonId, input.seasonId)));
	if (!entry || entry.contest.kind !== 'regional' || entry.contest.lifecycle !== 'finalized') throw new CutoffError('entry_out_of_scope', 'Manual decisions require an entry from a finalized regional contest in this season.');
	if (input.studentId) {
		const [member] = await db.select().from(schema.entryMembers).where(and(eq(schema.entryMembers.entryId, input.entryId), eq(schema.entryMembers.annualStudentId, input.studentId)));
		if (!member) throw new CutoffError('student_out_of_scope', 'Student is not a member of this entry.');
	}
	const [round] = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, input.seasonId), eq(schema.qualificationRounds.kind, 'manual_review'))).orderBy(asc(schema.qualificationRounds.createdAt));
	if (round && round.status === 'published') throw new CutoffError('published', 'Published manual qualification decisions are locked.');
	const manualRound = round ?? { id: crypto.randomUUID() };
	const [existing] = round ? await db.select().from(schema.qualifications).where(and(eq(schema.qualifications.roundId, round.id), eq(schema.qualifications.entryId, input.entryId))) : [];
	const now = input.now ?? Date.now();
	const qualificationId = existing?.id ?? crypto.randomUUID();
	const operations: any[] = [db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, entityType: 'qualification', entityId: qualificationId,
		action: input.include ? 'qualification_manually_included' : 'qualification_manually_excluded',
		detailsJson: sql`CASE WHEN EXISTS (SELECT 1 FROM seasons WHERE id = ${input.seasonId} AND status = 'qualifications')
		AND NOT EXISTS (SELECT 1 FROM qualification_rounds WHERE season_id = ${input.seasonId} AND kind = 'state_cutoff' AND status = 'published')
		THEN ${JSON.stringify({ reason, seasonId: input.seasonId })} ELSE NULL END`, createdAt: now })];
	if (!round) operations.push(db.insert(schema.qualificationRounds).values({ id: manualRound.id, seasonId: input.seasonId, kind: 'manual_review', status: 'draft', thresholdsJson: '{}', createdBy: input.actorUserId, createdAt: now }));
	if (existing) operations.push(db.update(schema.qualifications).set({ active: input.include }).where(eq(schema.qualifications.id, existing.id)));
	else operations.push(db.insert(schema.qualifications).values({ id: qualificationId, roundId: manualRound.id, seasonId: input.seasonId, entryId: input.entryId, studentId: input.studentId ?? null, active: input.include, createdAt: now }));
	operations.push(db.insert(schema.qualificationReasons).values({ id: crypto.randomUUID(), qualificationId, kind: input.include ? 'manual_include' : 'manual_exclude', rank: null, scope: 'overall', actualGrade: null, threshold: null, detailJson: JSON.stringify({ reason }), createdAt: now }));
	await db.batch(operations as [any, ...any[]]);
}
