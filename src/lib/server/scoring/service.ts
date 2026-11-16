import { getAdHocDashboard } from '$lib/server/state/ad-hoc';
import { scoringSection, isAdHocEntry } from '$lib/ad-hoc';
import { activeEntry } from '$lib/server/program/participation';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { guardedResultInsert, scoringAudit, scoringWriteAllowed } from '$lib/server/db/scoring-writes';
import { PersistenceRuleError, saveResult } from '$lib/server/db/repositories';
import { rankRegionalResults, rankStateResults, type RegionalRankings, type StateRankings, type RegionalResultRow } from './rankings';

export type ScoreCategory = 'project' | 'team_contest' | 'topical_team' | 'topical_individual' | 'knowdown';
export type KnowdownOutcome = 'placed' | 'eliminated';

export type ScoreInput = {
	score?: number | null;
	part1?: number | null;
	part2?: number | null;
	placement?: number | null;
	knowdownOutcome?: KnowdownOutcome | null;
};

export class ScoringError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'ScoringError';
	}
}

const teamCategories = new Set<ScoreCategory>(['project', 'team_contest', 'topical_team']);

function optionalNumber(value: number | null | undefined, label: string): number | null {
	if (value === undefined || value === null) return null;
	if (!Number.isFinite(value)) throw new ScoringError('invalid_score', `${label} must be a finite number.`);
	return value;
}

/** Validate score shape before it reaches the database or a ranking function. */
export function validateScoreInput(category: ScoreCategory, input: ScoreInput): Required<ScoreInput> {
	const score = optionalNumber(input.score, 'Score');
	const part1 = optionalNumber(input.part1, 'Part 1');
	const part2 = optionalNumber(input.part2, 'Part 2');
	const placement = input.placement === undefined || input.placement === null ? null : input.placement;
	const knowdownOutcome = input.knowdownOutcome === undefined ? (placement === null ? null : 'placed') : input.knowdownOutcome;
	if (knowdownOutcome !== null && knowdownOutcome !== 'placed' && knowdownOutcome !== 'eliminated') throw new ScoringError('invalid_knowdown_outcome', 'Knowdown outcome must be placed or eliminated.');

	if (placement !== null && (!Number.isInteger(placement) || placement < 1 || placement > 4)) {
		throw new ScoringError('invalid_placement', 'Placement must be an integer from 1 through 4.');
	}

	if (teamCategories.has(category) && category !== 'topical_team') {
		if (score !== null && score < 0) throw new ScoringError('invalid_score', 'Score cannot be negative.');
		if (part1 !== null || part2 !== null || placement !== null || knowdownOutcome !== null) throw new ScoringError('wrong_score_shape', 'This category accepts one numeric score only.');
		return { score, part1: null, part2: null, placement: null, knowdownOutcome: null };
	}

	if (category === 'topical_team' || category === 'topical_individual') {
		if (part1 !== null && (part1 < 0 || part1 > 75)) throw new ScoringError('invalid_part', 'Part 1 must be between 0 and 75.');
		if (part2 !== null && (part2 < 0 || part2 > 75)) throw new ScoringError('invalid_part', 'Part 2 must be between 0 and 75.');
		if (score !== null || placement !== null || knowdownOutcome !== null) throw new ScoringError('wrong_score_shape', 'Topical scoring accepts Part 1 and Part 2 only.');
		return { score: part1 !== null && part2 !== null ? part1 + part2 : null, part1, part2, placement: null, knowdownOutcome: null };
	}

	if (category === 'knowdown') {
		if (score !== null || part1 !== null || part2 !== null) throw new ScoringError('wrong_score_shape', 'Knowdown scoring accepts an outcome and optional placement only.');
		if (knowdownOutcome === 'eliminated' || knowdownOutcome === null) return { score: null, part1: null, part2: null, placement: null, knowdownOutcome };
		if (knowdownOutcome === 'placed' && placement === null) throw new ScoringError('placement_required', 'Enter a final place from 1 through 4.');
		return { score: null, part1: null, part2: null, placement, knowdownOutcome };
	}

	throw new ScoringError('invalid_category', 'Unknown score category.');
}

async function requireScoringContest(db: Database, contestId: string, allowFinalized = false) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	if (!contest) throw new ScoringError('contest_not_found', 'Contest not found.');
	if (!['roster_locked', 'scoring'].includes(contest.lifecycle) && !(allowFinalized && contest.lifecycle === 'finalized')) {
		throw new ScoringError('locked', 'Scores can only be changed while the contest is in scoring.');
	}
	return contest;
}

type ScoringContest = Awaited<ReturnType<typeof requireScoringContest>>;

/** Pass a contest the caller already loaded to avoid reading it again. */
export async function getScoringSnapshot(db: Database, contestId: string, loaded?: ScoringContest) {
	const contest = loaded?.id === contestId && ['roster_locked', 'scoring', 'finalized'].includes(loaded.lifecycle) ? loaded : await requireScoringContest(db, contestId, true);
	const rows = await db.select({
		entry: schema.entries,
		result: schema.results,
		schoolName: schema.schools.shortName,
		schoolFullName: schema.schools.name,
		lastEditorName: schema.users.displayName,
	}).from(schema.entries)
		.leftJoin(schema.results, eq(schema.results.entryId, schema.entries.id))
		.leftJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId))
		.leftJoin(schema.users, eq(schema.users.id, schema.results.lastEditedBy))
		.where(and(activeEntry(), eq(schema.entries.contestId, contestId)))
		.orderBy(asc(schema.entries.category), asc(schema.entries.division), asc(schema.entries.entryNumber));

	const allMembers = await db.select({ member: schema.entryMembers, studentName: schema.annualStudents.name, actualGrade: schema.annualStudents.actualGrade, schoolName: schema.schools.shortName })
		.from(schema.entryMembers)
		.innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId))
		.innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.entryMembers.annualStudentId))
		.innerJoin(schema.schools, eq(schema.schools.id, schema.annualStudents.schoolId))
		.where(and(activeEntry(), eq(schema.entries.contestId, contestId)));

	return {
		contest,
		entries: rows.map(({ entry, result, schoolName, schoolFullName, lastEditorName }) => {
			const part1 = result?.part1 ?? null;
			const part2 = result?.part2 ?? null;
			return {
				id: entry.id,
				category: entry.category as ScoreCategory,
				section: scoringSection(entry),
				adHoc: isAdHocEntry(entry),
				entryKind: entry.entryKind,
				entryNumber: entry.entryNumber,
				division: entry.division,
				members: allMembers.filter(({ member }) => member.entryId === entry.id).map(({ member, studentName, actualGrade, schoolName: memberSchoolName }) => ({ id: member.annualStudentId, name: studentName, actualGrade, competingGrade: member.competingGrade, schoolName: memberSchoolName })),
				schoolName: schoolName || schoolFullName || [...new Set(allMembers.filter(({ member }) => member.entryId === entry.id).map(({ schoolName: memberSchoolName }) => memberSchoolName).filter(Boolean))].join(' / ') || 'Statewide entry',
				score: result?.score ?? (part1 !== null && part2 !== null ? part1 + part2 : null),
				part1,
				part2,
				placement: result?.placement ?? null,
				knowdownOutcome: result?.knowdownOutcome ?? (entry.category === 'knowdown' ? 'eliminated' : null),
				version: result?.version ?? 0,
				lastEditedBy: lastEditorName || result?.lastEditedBy || null,
				updatedAt: result?.updatedAt ?? null,
			};
		}),
	};
}

export async function saveContestResult(db: Database, input: { contestId: string; entryId: string; actorUserId: string; expectedVersion?: number; now?: number } & ScoreInput) {
	const contest = await requireScoringContest(db, input.contestId);
	const [entry] = await db.select().from(schema.entries).where(and(activeEntry(), eq(schema.entries.id, input.entryId), eq(schema.entries.contestId, contest.id)));
	if (!entry) throw new ScoringError('entry_out_of_scope', 'Entry does not belong to this contest.');
	const values = validateScoreInput(entry.category as ScoreCategory, input);
	if (entry.category === 'knowdown' && values.knowdownOutcome === 'placed' && values.placement !== null) {
		const conflicts = await db.select({ entryId: schema.entries.id }).from(schema.entries)
			.innerJoin(schema.results, eq(schema.results.entryId, schema.entries.id))
			.where(and(activeEntry(), eq(schema.entries.contestId, contest.id), eq(schema.entries.category, 'knowdown'), eq(schema.results.placement, values.placement)));
		if (conflicts.some((row) => row.entryId !== entry.id)) throw new ScoringError('duplicate_placement', `Knowdown place ${values.placement} is already assigned to another entrant.`);
	}
	let saved;
	try {
		saved = await saveResult(db, { contestId: contest.id, entryId: entry.id, expectedVersion: input.expectedVersion, ...values, lastEditedBy: input.actorUserId, audit: { actorUserId: input.actorUserId, detailsJson: JSON.stringify({ category: entry.category, ...values, version: (input.expectedVersion ?? 0) + 1 }), now: input.now ?? Date.now() } });
	} catch (cause) {
		if (cause instanceof PersistenceRuleError) throw new ScoringError(cause.code, cause.message);
		throw cause;
	}
	const [result] = saved;
	await auditQualificationImpact(db, contest, input.actorUserId, entry.id, entry.category, input.now);
	return result;
}

async function auditQualificationImpact(db: Database, contest: Awaited<ReturnType<typeof requireScoringContest>>, actorUserId: string, entryId: string | null, category: string, now = Date.now()) {
	const [publishedQualificationRound] = contest.kind === 'regional'
		? await db.select({ id: schema.qualificationRounds.id }).from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, contest.seasonId), eq(schema.qualificationRounds.status, 'published'))).limit(1)
		: [];
	if (publishedQualificationRound) await db.insert(schema.auditEvents).values({
		id: crypto.randomUUID(), actorUserId, contestId: contest.id, entityType: 'qualification_round', entityId: publishedQualificationRound.id,
		action: 'qualification_impact_review_required', detailsJson: JSON.stringify({ entryId, category, reason: 'score_changed_after_qualification_publication' }), createdAt: now,
	});
}

/** Interactive entry updates exactly one cell; SQLite serializes concurrent upserts. */
export async function saveScoreCell(db: Database, input: { contestId: string; entryId: string; actorUserId: string; field: string; value: number | null }) {
	const contest = await requireScoringContest(db, input.contestId);
	const [entry] = await db.select().from(schema.entries).where(and(activeEntry(), eq(schema.entries.id, input.entryId), eq(schema.entries.contestId, contest.id)));
	if (!entry) throw new ScoringError('entry_out_of_scope', 'Entry does not belong to this contest.');
	const topical = entry.category === 'topical_team' || entry.category === 'topical_individual';
	if (!(topical ? ['part1', 'part2'] : ['score']).includes(input.field) || entry.category === 'knowdown') throw new ScoringError('wrong_score_shape', 'This field is not editable for this category.');
	const field = input.field as 'score' | 'part1' | 'part2';
	validateScoreInput(entry.category as ScoreCategory, { [field]: input.value });
	const now = Date.now();
	const total = field === 'part1' ? sql`${input.value} + ${schema.results.part2}` : sql`${schema.results.part1} + ${input.value}`;
	const saved = guardedResultInsert(db, { entryId: entry.id, [field]: input.value, lastEditedBy: input.actorUserId, updatedAt: now }, contest.id)
		.onConflictDoUpdate({ target: schema.results.entryId, setWhere: scoringWriteAllowed(contest.id, entry.id), set: { [field]: input.value, ...(topical ? { score: total } : {}), version: sql`${schema.results.version} + 1`, lastEditedBy: input.actorUserId, updatedAt: now } }).returning();
	const [written] = await db.batch([saved, scoringAudit(db, { actorUserId: input.actorUserId, contestId: contest.id, entityType: 'result', entityId: entry.id, action: 'score_saved', detailsJson: JSON.stringify({ field, value: input.value }), now })]);
	if (!written.length) throw new ScoringError('locked', 'The contest or entry changed. Refresh before saving.');
	await auditQualificationImpact(db, contest, input.actorUserId, entry.id, entry.category);
}

/** Replace one place atomically, including removal of its previous occupant. */
export async function saveKnowdownPlace(db: Database, input: { contestId: string; placement: number; entryId: string | null; actorUserId: string }) {
	const contest = await requireScoringContest(db, input.contestId);
	validateScoreInput('knowdown', { placement: input.placement });
	if (input.entryId) {
		const [entry] = await db.select().from(schema.entries).where(and(activeEntry(), eq(schema.entries.id, input.entryId), eq(schema.entries.contestId, contest.id), eq(schema.entries.category, 'knowdown')));
		if (!entry) throw new ScoringError('entry_out_of_scope', 'Choose a Knowdown student from this contest.');
	}
	const now = Date.now();
	const guard = db.update(schema.contests).set({ updatedAt: now }).where(and(eq(schema.contests.id, contest.id), scoringWriteAllowed(contest.id, input.entryId ?? undefined))).returning({ id: schema.contests.id });
	const clear = db.update(schema.results).set({ placement: null, knowdownOutcome: 'eliminated', version: sql`${schema.results.version} + 1`, lastEditedBy: input.actorUserId, updatedAt: now })
		.where(and(scoringWriteAllowed(contest.id, input.entryId ?? undefined), eq(schema.results.placement, input.placement), inArray(schema.results.entryId, db.select({ id: schema.entries.id }).from(schema.entries).where(and(activeEntry(), eq(schema.entries.contestId, contest.id), eq(schema.entries.category, 'knowdown'))))));
	const audit = scoringAudit(db, { actorUserId: input.actorUserId, contestId: contest.id, entityType: 'result', entityId: input.entryId ?? contest.id, action: 'knowdown_place_saved', detailsJson: JSON.stringify({ placement: input.placement, entryId: input.entryId }), now });
	if (input.entryId) {
		const assign = guardedResultInsert(db, { entryId: input.entryId, placement: input.placement, knowdownOutcome: 'placed', lastEditedBy: input.actorUserId, updatedAt: now }, contest.id)
			.onConflictDoUpdate({ target: schema.results.entryId, setWhere: scoringWriteAllowed(contest.id, input.entryId), set: { placement: input.placement, knowdownOutcome: 'placed', version: sql`${schema.results.version} + 1`, lastEditedBy: input.actorUserId, updatedAt: now } }).returning();
		const [admitted, , written] = await db.batch([guard, clear, assign, audit]);
		if (!admitted.length || !written.length) throw new ScoringError('locked', 'The contest or entry changed. Refresh before saving.');
	} else {
		const [admitted] = await db.batch([guard, clear, audit]);
		if (!admitted.length) throw new ScoringError('locked', 'The contest changed. Refresh before saving.');
	}
	await auditQualificationImpact(db, contest, input.actorUserId, input.entryId, 'knowdown');
}

export function findDuplicateKnowdownPlaces(rows: { entryId: string; category: string; placement: number | null; knowdownOutcome: string | null }[]) {
	const entriesByPlace = new Map<number, string[]>();
	for (const row of rows) {
		if (row.category !== 'knowdown' || row.knowdownOutcome !== 'placed' || row.placement === null) continue;
		entriesByPlace.set(row.placement, [...(entriesByPlace.get(row.placement) ?? []), row.entryId]);
	}
	return [...entriesByPlace].filter(([, entryIds]) => entryIds.length > 1).map(([placement, entryIds]) => ({ placement, entryIds }));
}

type ScoringSnapshot = Awaited<ReturnType<typeof getScoringSnapshot>>;

/** Pass the snapshot a page already loaded: the report is derived from the same entries and results. */
export async function getFinalizationReport(db: Database, contestId: string, loaded?: ScoringSnapshot) {
	const snapshot = loaded?.contest.id === contestId ? loaded : await getScoringSnapshot(db, contestId);
	const { contest } = snapshot;
	const missing = snapshot.entries.filter((entry) => {
		if (entry.category === 'topical_team' || entry.category === 'topical_individual') return entry.part1 === null || entry.part2 === null;
		if (entry.category === 'knowdown') return false;
		return entry.score === null;
	}).map((entry) => ({ entryId: entry.id, category: entry.category, entryNumber: entry.entryNumber, division: entry.division, schoolName: entry.schoolName, resultVersion: entry.version }));
	const duplicateKnowdownPlaces = findDuplicateKnowdownPlaces(snapshot.entries.map((entry) => ({ entryId: entry.id, category: entry.category, placement: entry.placement, knowdownOutcome: entry.knowdownOutcome })));
	const adHocNeedsAttention = contest.kind === 'state' && (await getAdHocDashboard(db, contestId)).some(pool => pool.needsRegeneration);
	return { contest, missing, duplicateKnowdownPlaces, adHocNeedsAttention, complete: !adHocNeedsAttention && missing.length === 0 && duplicateKnowdownPlaces.length === 0 };
}

export async function finalizeContest(db: Database, input: { contestId: string; actorUserId: string; now?: number }) {
	const report = await getFinalizationReport(db, input.contestId);
	if (report.contest.lifecycle !== 'scoring') throw new ScoringError('invalid_transition', 'Only contests in scoring can be finalized.');
	if (report.duplicateKnowdownPlaces.length) throw new ScoringError('duplicate_placement', `Knowdown places must be unique. Duplicate place${report.duplicateKnowdownPlaces.length === 1 ? '' : 's'}: ${report.duplicateKnowdownPlaces.map((item) => item.placement).join(', ')}.`);
	if (report.adHocNeedsAttention) throw new ScoringError('ad_hoc_pending', 'Ad-hoc assignments need attention before finalization.');
	if (report.missing.length) throw new ScoringError('incomplete', `${report.missing.length} result${report.missing.length === 1 ? '' : 's'} still need attention.`);
	const now = input.now ?? Date.now();
	const transition = db.update(schema.contests).set({ lifecycle: 'finalized', updatedAt: now })
		.where(and(eq(schema.contests.id, input.contestId), eq(schema.contests.lifecycle, 'scoring'), eq(schema.contests.scoringRevision, report.contest.scoringRevision), sql`EXISTS (SELECT 1 FROM seasons WHERE id = ${report.contest.seasonId} AND status <> 'archived')`)).returning({ id: schema.contests.id });
	const [changed] = await db.batch([transition, scoringAudit(db, { actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'contest', entityId: input.contestId, action: 'contest_finalized', detailsJson: '{}', now })]);
	if (!changed.length) throw new ScoringError('stale_contest', 'Results or registration changed during finalization. Refresh and review them again.');
}

export async function reopenContest(db: Database, input: { contestId: string; actorUserId: string; reason: string; now?: number }) {
	const reason = input.reason.trim();
	if (!reason) throw new ScoringError('reason_required', 'A reason is required to reopen a contest.');
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest) throw new ScoringError('contest_not_found', 'Contest not found.');
	if (contest.lifecycle !== 'finalized') throw new ScoringError('invalid_transition', 'Only finalized contests can be reopened.');
	const now = input.now ?? Date.now();
	const transition = db.update(schema.contests).set({ lifecycle: 'scoring', resultsPublishedAt: null, updatedAt: now })
		.where(and(eq(schema.contests.id, input.contestId), eq(schema.contests.lifecycle, 'finalized'), sql`EXISTS (SELECT 1 FROM seasons WHERE id = ${contest.seasonId} AND status <> 'archived')`)).returning({ id: schema.contests.id });
	const [changed] = await db.batch([transition, scoringAudit(db, { actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'contest', entityId: input.contestId, action: 'contest_reopened', detailsJson: JSON.stringify({ reason }), now })]);
	if (!changed.length) throw new ScoringError('stale_contest', 'The contest changed or was archived. Refresh before reopening.');
}

export async function publishContestResults(db: Database, input: { contestId: string; actorUserId: string; now?: number }) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest) throw new ScoringError('contest_not_found', 'Contest not found.');
	if (contest.lifecycle !== 'finalized') throw new ScoringError('not_finalized', 'A contest must be finalized before results are published.');
	if (contest.resultsPublishedAt !== null) return;
	const now = input.now ?? Date.now();
	const transition = db.update(schema.contests).set({ resultsPublishedAt: now, updatedAt: now })
		.where(and(eq(schema.contests.id, input.contestId), eq(schema.contests.lifecycle, 'finalized'), eq(schema.contests.scoringRevision, contest.scoringRevision), sql`${schema.contests.resultsPublishedAt} IS NULL`, sql`EXISTS (SELECT 1 FROM seasons WHERE id = ${contest.seasonId} AND status <> 'archived')`)).returning({ id: schema.contests.id });
	const [changed] = await db.batch([transition, scoringAudit(db, { actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'contest', entityId: input.contestId, action: 'results_published', detailsJson: JSON.stringify({ publishedAt: now }), now })]);
	if (!changed.length) throw new ScoringError('stale_contest', 'The contest changed or was archived. Refresh before publishing.');
}

function knowdownOutcomeRows(snapshot: Awaited<ReturnType<typeof getScoringSnapshot>>) {
	return snapshot.entries.filter((entry) => entry.category === 'knowdown' && entry.knowdownOutcome !== null).map((entry) => ({
		entryId: entry.id,
		outcome: entry.knowdownOutcome!,
		placement: entry.placement,
		division: entry.division,
		entryNumber: entry.entryNumber,
		studentName: entry.members[0]?.name ?? null,
		schoolName: entry.schoolName,
	}));
}

export async function getRegionalRankings(db: Database, contestId: string): Promise<{ contest: Awaited<ReturnType<typeof getScoringSnapshot>>['contest']; rankings: RegionalRankings; knowdownOutcomes: ReturnType<typeof knowdownOutcomeRows> }> {
	const snapshot = await getScoringSnapshot(db, contestId);
	if (snapshot.contest.kind !== 'regional') throw new ScoringError('not_regional', 'Only regional contests have regional rankings.');
	if (snapshot.contest.lifecycle !== 'finalized') throw new ScoringError('not_finalized', 'Regional rankings are available after finalization.');
	const rows: RegionalResultRow[] = snapshot.entries.map((entry) => ({
		entryId: entry.id, category: entry.category, division: entry.division, entryNumber: entry.entryNumber, schoolName: entry.schoolName,
		score: entry.score, part1: entry.part1, part2: entry.part2, placement: entry.placement,
		studentId: entry.category === 'topical_individual' || entry.category === 'knowdown' ? entry.members[0]?.id ?? null : null,
		studentName: entry.category === 'topical_individual' || entry.category === 'knowdown' ? entry.members[0]?.name ?? null : null,
		actualGrade: entry.category === 'topical_individual' ? entry.members[0]?.actualGrade ?? null : null,
	}));
	return { contest: snapshot.contest, rankings: rankRegionalResults(rows), knowdownOutcomes: knowdownOutcomeRows(snapshot) };
}

export async function getStateRankings(db: Database, contestId: string): Promise<{ contest: Awaited<ReturnType<typeof getScoringSnapshot>>['contest']; rankings: StateRankings; knowdownOutcomes: ReturnType<typeof knowdownOutcomeRows> }> {
	const snapshot = await getScoringSnapshot(db, contestId);
	if (snapshot.contest.kind !== 'state') throw new ScoringError('not_state', 'Only state contests have state rankings.');
	if (snapshot.contest.lifecycle !== 'finalized') throw new ScoringError('not_finalized', 'State rankings are available after finalization.');
	const rows: RegionalResultRow[] = snapshot.entries.map((entry) => ({
		entryId: entry.id, category: entry.category, adHoc: entry.adHoc, division: entry.division, entryNumber: entry.entryNumber, schoolName: entry.schoolName,
		score: entry.score, part1: entry.part1, part2: entry.part2, placement: entry.placement,
		studentId: entry.category === 'topical_individual' || entry.category === 'knowdown' ? entry.members[0]?.id ?? null : null,
		studentName: entry.adHoc ? entry.members.map(m => `${m.name} (${m.schoolName})`).join(', ') : entry.category === 'topical_individual' || entry.category === 'knowdown' ? entry.members[0]?.name ?? null : null,
		actualGrade: entry.category === 'topical_individual' ? entry.members[0]?.actualGrade ?? null : null,
	}));
	return { contest: snapshot.contest, rankings: rankStateResults(rows), knowdownOutcomes: knowdownOutcomeRows(snapshot) };
}
