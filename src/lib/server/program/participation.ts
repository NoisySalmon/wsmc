import { and, eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';

export type InvitationStatus = 'pending' | 'invited' | 'accepted' | 'declined';

export class ParticipationError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'ParticipationError';
	}
}

export async function inviteSchool(db: Database, input: { contestId: string; schoolId: string; division?: number | null; now?: number }) {
	if (input.division !== undefined && input.division !== null && (!Number.isInteger(input.division) || ![1, 2].includes(input.division))) throw new ParticipationError('invalid_division', 'Division must be 1 or 2.');
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest) throw new ParticipationError('not_found', 'Contest not found.');
	if (!['setup', 'registration_open'].includes(contest.lifecycle)) throw new ParticipationError('locked', 'Schools can only be invited before rosters are locked.');
	const [school] = await db.select().from(schema.schools).where(eq(schema.schools.id, input.schoolId));
	if (!school || !school.active) throw new ParticipationError('inactive_school', 'Only active schools can be invited.');
	// Division lives on the school record; the participation stores a snapshot so
	// history is preserved if the school later changes division. An explicit
	// division may still be passed to override for a single contest.
	const division = input.division ?? school.division;
	if (!Number.isInteger(division) || ![1, 2].includes(division)) throw new ParticipationError('invalid_division', 'Division must be 1 or 2.');
	const now = input.now ?? Date.now();
	const [participation] = await db.insert(schema.schoolParticipations).values({ id: crypto.randomUUID(), contestId: input.contestId, schoolId: input.schoolId, division, invitationStatus: 'invited', createdAt: now, updatedAt: now }).returning();
	return participation;
}

export async function setParticipationStatus(db: Database, input: { participationId: string; contestId: string; status: InvitationStatus; now?: number }) {
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.id, input.participationId), eq(schema.schoolParticipations.contestId, input.contestId)));
	if (!participation) throw new ParticipationError('not_found', 'Participation record not found.');
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest || !['setup', 'registration_open'].includes(contest.lifecycle)) throw new ParticipationError('locked', 'Participation responses are closed.');
	await db.update(schema.schoolParticipations).set({ invitationStatus: input.status, updatedAt: input.now ?? Date.now() }).where(and(eq(schema.schoolParticipations.id, input.participationId), eq(schema.schoolParticipations.contestId, input.contestId)));
}

export async function assignCoach(db: Database, input: { userId: string; seasonId: string; schoolId: string; now?: number }): Promise<void> {
	const [season] = await db.select({ id: schema.seasons.id, status: schema.seasons.status }).from(schema.seasons).where(eq(schema.seasons.id, input.seasonId));
	if (!season) throw new ParticipationError('not_found', 'Season not found.');
	if (season.status === 'archived') throw new ParticipationError('archived', 'Archived seasons are read-only.');
	const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.id, input.userId), eq(schema.users.status, 'active')));
	if (!user) throw new ParticipationError('invalid_user', 'Only active users can be assigned as coaches.');
	const [school] = await db.select({ id: schema.schools.id }).from(schema.schools).where(and(eq(schema.schools.id, input.schoolId), eq(schema.schools.active, true)));
	if (!school) throw new ParticipationError('inactive_school', 'Only active schools can have new coach assignments.');
	await db.insert(schema.coachAssignments).values({ userId: input.userId, seasonId: input.seasonId, schoolId: input.schoolId, createdAt: input.now ?? Date.now() }).onConflictDoNothing();
}

/** Remove a school from a contest so it can be re-added elsewhere (region moves).
 * Blocked when roster members or entries already reference the school in that contest. */
export async function withdrawSchool(db: Database, input: { participationId: string; contestId: string }): Promise<void> {
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.id, input.participationId), eq(schema.schoolParticipations.contestId, input.contestId)));
	if (!participation) throw new ParticipationError('not_found', 'Participation record not found.');
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest || !['setup', 'registration_open'].includes(contest.lifecycle)) throw new ParticipationError('locked', 'Schools can only be removed before rosters are locked.');
	const roster = await db.select({ contestId: schema.contestRosterMembers.contestId }).from(schema.contestRosterMembers).where(and(eq(schema.contestRosterMembers.contestId, input.contestId), eq(schema.contestRosterMembers.participationId, input.participationId)));
	if (roster.length > 0) throw new ParticipationError('has_roster', 'Remove roster students and entries before moving this school.');
	const entries = await db.select({ id: schema.entries.id }).from(schema.entries).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, participation.schoolId)));
	if (entries.length > 0) throw new ParticipationError('has_entries', 'Delete category entries before moving this school.');
	await db.delete(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.id, input.participationId), eq(schema.schoolParticipations.contestId, input.contestId)));
}

export async function removeCoach(db: Database, input: { userId: string; seasonId: string; schoolId: string }): Promise<void> {
	await db.delete(schema.coachAssignments).where(and(eq(schema.coachAssignments.userId, input.userId), eq(schema.coachAssignments.seasonId, input.seasonId), eq(schema.coachAssignments.schoolId, input.schoolId)));
}
