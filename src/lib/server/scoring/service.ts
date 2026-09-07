import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { PersistenceRuleError, saveResult } from '$lib/server/db/repositories';
import { rankRegionalResults, type RegionalRankings, type RegionalResultRow } from './rankings';

export type ScoreCategory = 'project' | 'team_contest' | 'topical_team' | 'topical_individual' | 'knowdown';

export type ScoreInput = {
	score?: number | null;
	part1?: number | null;
	part2?: number | null;
	placement?: number | null;
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

	if (placement !== null && (!Number.isInteger(placement) || placement < 1 || placement > 4)) {
		throw new ScoringError('invalid_placement', 'Placement must be an integer from 1 through 4.');
	}

	if (teamCategories.has(category) && category !== 'topical_team') {
		if (score !== null && score < 0) throw new ScoringError('invalid_score', 'Score cannot be negative.');
		if (part1 !== null || part2 !== null || placement !== null) throw new ScoringError('wrong_score_shape', 'This category accepts one numeric score only.');
		return { score, part1: null, part2: null, placement: null };
	}

	if (category === 'topical_team' || category === 'topical_individual') {
		if (part1 !== null && (part1 < 0 || part1 > 75)) throw new ScoringError('invalid_part', 'Part 1 must be between 0 and 75.');
		if (part2 !== null && (part2 < 0 || part2 > 75)) throw new ScoringError('invalid_part', 'Part 2 must be between 0 and 75.');
		if (score !== null || placement !== null) throw new ScoringError('wrong_score_shape', 'Topical scoring accepts Part 1 and Part 2 only.');
		return { score: part1 !== null && part2 !== null ? part1 + part2 : null, part1, part2, placement: null };
	}

	if (category === 'knowdown') {
		if (score !== null || part1 !== null || part2 !== null) throw new ScoringError('wrong_score_shape', 'Knowdown scoring accepts placement only.');
		return { score: null, part1: null, part2: null, placement };
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

export async function getScoringSnapshot(db: Database, contestId: string) {
	const contest = await requireScoringContest(db, contestId, true);
	const rows = await db.select({
		entry: schema.entries,
		result: schema.results,
		schoolName: schema.schools.shortName,
		schoolFullName: schema.schools.name,
	}).from(schema.entries)
		.leftJoin(schema.results, eq(schema.results.entryId, schema.entries.id))
		.leftJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId))
		.where(eq(schema.entries.contestId, contestId))
		.orderBy(asc(schema.entries.category), asc(schema.entries.division), asc(schema.entries.entryNumber));

	const entryIds = rows.map((row) => row.entry.id);
	const members = entryIds.length === 0
		? []
		: await db.select({ member: schema.entryMembers, studentName: schema.annualStudents.name, actualGrade: schema.annualStudents.actualGrade })
			.from(schema.entryMembers)
			.innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.entryMembers.annualStudentId))
			.where(eq(schema.entryMembers.entryId, entryIds[0]));
	// D1/SQLite does not accept an empty IN list. Load the remaining members separately when needed.
	const allMembers = entryIds.length <= 1 ? members : await db.select({ member: schema.entryMembers, studentName: schema.annualStudents.name, actualGrade: schema.annualStudents.actualGrade })
		.from(schema.entryMembers)
		.innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.entryMembers.annualStudentId))
		.where(inArray(schema.entryMembers.entryId, entryIds));

	return {
		contest,
		entries: rows.map(({ entry, result, schoolName, schoolFullName }) => {
			const part1 = result?.part1 ?? null;
			const part2 = result?.part2 ?? null;
			return {
				id: entry.id,
				category: entry.category as ScoreCategory,
				entryKind: entry.entryKind,
				entryNumber: entry.entryNumber,
				division: entry.division,
				schoolName: schoolName || schoolFullName || 'Statewide entry',
			members: allMembers.filter(({ member }) => member.entryId === entry.id).map(({ member, studentName, actualGrade }) => ({ id: member.annualStudentId, name: studentName, actualGrade, competingGrade: member.competingGrade })),
				score: result?.score ?? (part1 !== null && part2 !== null ? part1 + part2 : null),
				part1,
				part2,
				placement: result?.placement ?? null,
				version: result?.version ?? 0,
				lastEditedBy: result?.lastEditedBy ?? null,
				updatedAt: result?.updatedAt ?? null,
			};
		}),
	};
}

export async function saveContestResult(db: Database, input: { contestId: string; entryId: string; actorUserId: string; expectedVersion?: number; now?: number } & ScoreInput) {
	const contest = await requireScoringContest(db, input.contestId);
	const [entry] = await db.select().from(schema.entries).where(and(eq(schema.entries.id, input.entryId), eq(schema.entries.contestId, contest.id)));
	if (!entry) throw new ScoringError('entry_out_of_scope', 'Entry does not belong to this contest.');
	const values = validateScoreInput(entry.category as ScoreCategory, input);
	let saved;
	try {
		saved = await saveResult(db, { contestId: contest.id, entryId: entry.id, expectedVersion: input.expectedVersion, ...values, lastEditedBy: input.actorUserId });
	} catch (cause) {
		if (cause instanceof PersistenceRuleError) throw new ScoringError(cause.code, cause.message);
		throw cause;
	}
	const [result] = saved;
	await db.insert(schema.auditEvents).values({
		id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: contest.id, entityType: 'result', entityId: entry.id,
		action: 'score_saved', detailsJson: JSON.stringify({ category: entry.category, score: values.score, part1: values.part1, part2: values.part2, placement: values.placement, version: result?.version ?? null }), createdAt: input.now ?? Date.now(),
	});
	const [publishedQualificationRound] = await db.select({ id: schema.qualificationRounds.id }).from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, contest.seasonId), eq(schema.qualificationRounds.status, 'published'))).limit(1);
	if (publishedQualificationRound) await db.insert(schema.auditEvents).values({
		id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: contest.id, entityType: 'qualification_round', entityId: publishedQualificationRound.id,
		action: 'qualification_impact_review_required', detailsJson: JSON.stringify({ entryId: entry.id, category: entry.category, reason: 'score_changed_after_qualification_publication' }), createdAt: input.now ?? Date.now(),
	});
	return result;
}

export async function getFinalizationReport(db: Database, contestId: string) {
	const contest = await requireScoringContest(db, contestId, true);
	const rows = await db.select({ entry: schema.entries, result: schema.results, schoolName: schema.schools.shortName })
		.from(schema.entries).leftJoin(schema.results, eq(schema.results.entryId, schema.entries.id)).leftJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId))
		.where(eq(schema.entries.contestId, contest.id));
	const missing = rows.filter(({ entry, result }) => {
		if (entry.category === 'topical_team' || entry.category === 'topical_individual') return result?.part1 === null || result?.part1 === undefined || result?.part2 === null || result?.part2 === undefined;
		if (entry.category === 'knowdown') return result?.placement === null || result?.placement === undefined;
		return result?.score === null || result?.score === undefined;
	}).map(({ entry, result, schoolName }) => ({ entryId: entry.id, category: entry.category, entryNumber: entry.entryNumber, division: entry.division, schoolName: schoolName || 'Statewide entry', resultVersion: result?.version ?? 0 }));
	return { contest, missing, complete: missing.length === 0 };
}

export async function finalizeContest(db: Database, input: { contestId: string; actorUserId: string; now?: number }) {
	const report = await getFinalizationReport(db, input.contestId);
	if (report.contest.lifecycle !== 'scoring') throw new ScoringError('invalid_transition', 'Only contests in scoring can be finalized.');
	if (!report.complete) throw new ScoringError('incomplete', `${report.missing.length} result${report.missing.length === 1 ? '' : 's'} still need attention.`);
	await db.update(schema.contests).set({ lifecycle: 'finalized', updatedAt: input.now ?? Date.now() }).where(and(eq(schema.contests.id, input.contestId), eq(schema.contests.lifecycle, 'scoring')));
	await db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'contest', entityId: input.contestId, action: 'contest_finalized', detailsJson: '{}', createdAt: input.now ?? Date.now() });
}

export async function reopenContest(db: Database, input: { contestId: string; actorUserId: string; reason: string; now?: number }) {
	const reason = input.reason.trim();
	if (!reason) throw new ScoringError('reason_required', 'A reason is required to reopen a contest.');
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest) throw new ScoringError('contest_not_found', 'Contest not found.');
	if (contest.lifecycle !== 'finalized') throw new ScoringError('invalid_transition', 'Only finalized contests can be reopened.');
	await db.update(schema.contests).set({ lifecycle: 'scoring', resultsPublishedAt: null, updatedAt: input.now ?? Date.now() }).where(and(eq(schema.contests.id, input.contestId), eq(schema.contests.lifecycle, 'finalized')));
	await db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'contest', entityId: input.contestId, action: 'contest_reopened', detailsJson: JSON.stringify({ reason }), createdAt: input.now ?? Date.now() });
}

export async function publishContestResults(db: Database, input: { contestId: string; actorUserId: string; now?: number }) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest) throw new ScoringError('contest_not_found', 'Contest not found.');
	if (contest.lifecycle !== 'finalized') throw new ScoringError('not_finalized', 'A contest must be finalized before results are published.');
	const publishedAt = contest.resultsPublishedAt ?? input.now ?? Date.now();
	await db.update(schema.contests).set({ resultsPublishedAt: publishedAt, updatedAt: input.now ?? Date.now() }).where(eq(schema.contests.id, input.contestId));
	await db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'contest', entityId: input.contestId, action: 'results_published', detailsJson: JSON.stringify({ publishedAt }), createdAt: input.now ?? Date.now() });
}

export async function getRegionalRankings(db: Database, contestId: string): Promise<{ contest: Awaited<ReturnType<typeof getScoringSnapshot>>['contest']; rankings: RegionalRankings }> {
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
	return { contest: snapshot.contest, rankings: rankRegionalResults(rows) };
}
