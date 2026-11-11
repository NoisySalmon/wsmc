import { getRegistrationReadiness } from '$lib/server/registration/readiness';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';

export class ParticipationError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'ParticipationError';
	}
}

export async function assignSchool(db: Database, input: { contestId: string; schoolId: string; division?: number | null; now?: number }) {
	if (input.division !== undefined && input.division !== null && (!Number.isInteger(input.division) || ![1, 2].includes(input.division))) throw new ParticipationError('invalid_division', 'Division must be 1 or 2.');
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest) throw new ParticipationError('not_found', 'Contest not found.');
	if (!['setup', 'registration_open'].includes(contest.lifecycle)) throw new ParticipationError('locked', 'Schools can only be assigned before rosters are locked.');
	if (contest.kind !== 'regional') throw new ParticipationError('invalid_contest', 'Choose a regional contest.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	if (!season || season.status === 'archived') throw new ParticipationError('locked', 'Archived seasons are read-only.');
	const existing = await db.select({ id: schema.schoolParticipations.id })
		.from(schema.schoolParticipations)
		.innerJoin(schema.contests, eq(schema.contests.id, schema.schoolParticipations.contestId))
		.where(and(eq(schema.schoolParticipations.schoolId, input.schoolId), eq(schema.contests.seasonId, contest.seasonId), eq(schema.contests.kind, 'regional')));
	if (existing.length) throw new ParticipationError('already_assigned', 'This school already has a region. Remove its participation there before assigning it here.');
	const [school] = await db.select().from(schema.schools).where(eq(schema.schools.id, input.schoolId));
	if (!school || !school.active) throw new ParticipationError('inactive_school', 'Only active schools can be assigned.');
	// Division lives on the school record; the participation stores a snapshot so
	// history is preserved if the school later changes division. An explicit
	// division may still be passed to override for a single contest.
	const division = input.division ?? school.division;
	if (!Number.isInteger(division) || ![1, 2].includes(division)) throw new ParticipationError('invalid_division', 'Division must be 1 or 2.');
	const now = input.now ?? Date.now();
	const [participation] = await db.insert(schema.schoolParticipations).values({ id: crypto.randomUUID(), contestId: input.contestId, schoolId: input.schoolId, division, createdAt: now, updatedAt: now }).returning();
	return participation;
}

/** Remove an unused school assignment during setup (region moves).
 * Blocked when roster members or entries already reference the school in that contest. */
export async function removeSchoolParticipation(db: Database, input: { participationId: string; contestId: string }): Promise<void> {
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.id, input.participationId), eq(schema.schoolParticipations.contestId, input.contestId)));
	if (!participation) throw new ParticipationError('not_found', 'Participation record not found.');
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest || contest.lifecycle !== 'setup') throw new ParticipationError('locked', 'Participation can only be removed during setup. Withdraw the school instead.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	if (!season || season.status === 'archived') throw new ParticipationError('locked', 'Archived seasons are read-only.');
	const roster = await db.select({ contestId: schema.contestRosterMembers.contestId }).from(schema.contestRosterMembers).where(and(eq(schema.contestRosterMembers.contestId, input.contestId), eq(schema.contestRosterMembers.participationId, input.participationId)));
	if (roster.length > 0) throw new ParticipationError('has_roster', 'Remove roster students and entries before moving this school.');
	const entries = await db.select({ id: schema.entries.id }).from(schema.entries).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, participation.schoolId)));
	if (entries.length > 0) throw new ParticipationError('has_entries', 'Delete category entries before moving this school.');
	await db.delete(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.id, input.participationId), eq(schema.schoolParticipations.contestId, input.contestId)));
}

/** Shared exclusion for scoring, results, and qualification queries. State entries are unaffected. */
export function activeEntry() {
	return sql`NOT EXISTS (SELECT 1 FROM school_participations AS withdrawn
		WHERE withdrawn.contest_id = ${schema.entries.contestId}
		AND withdrawn.school_id = ${schema.entries.ownerSchoolId}
		AND withdrawn.withdrawn_at IS NOT NULL)`;
}

export async function setParticipationWithdrawn(db: Database, input: { contestId: string; participationId: string; withdrawn: boolean; actorUserId: string }) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest || contest.kind !== 'regional' || contest.lifecycle === 'finalized') throw new ParticipationError('locked', 'Participation cannot change after finalization.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	if (!season || season.status === 'archived') throw new ParticipationError('locked', 'Archived seasons are read-only.');
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.id, input.participationId), eq(schema.schoolParticipations.contestId, contest.id)));
	if (!participation) throw new ParticipationError('not_found', 'School participation not found.');
	if (!input.withdrawn && ['roster_locked', 'scoring'].includes(contest.lifecycle)) {
		const readiness = await getRegistrationReadiness(db, contest.id);
		if (readiness.find(school => school.schoolId === participation.schoolId)?.issues.length) throw new ParticipationError('incomplete_registration', 'Reopen registration and resolve this school’s registration issues before restoring it.');
	}
	const scored = await db.select({ id: schema.entries.id }).from(schema.entries).innerJoin(schema.results, eq(schema.results.entryId, schema.entries.id)).where(and(eq(schema.entries.contestId, contest.id), eq(schema.entries.ownerSchoolId, participation.schoolId)));
	if (input.withdrawn && scored.length) throw new ParticipationError('has_scores', 'A school with recorded results cannot be withdrawn.');
	const now = Date.now();
	await db.batch([
		db.update(schema.schoolParticipations).set({ withdrawnAt: input.withdrawn ? now : null, updatedAt: now }).where(eq(schema.schoolParticipations.id, participation.id)),
		db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: contest.id, entityType: 'school_participation', entityId: participation.id, action: input.withdrawn ? 'school_withdrawn' : 'school_restored', detailsJson: JSON.stringify({ schoolId: participation.schoolId }), createdAt: now })
	]);
}
