import { and, eq, inArray } from 'drizzle-orm';
import { canAdministerUsers, canCoordinateRegion, canCoordinateState } from '$lib/server/auth/capabilities';
import { schema, type Database } from '$lib/server/db';

/** Regional assignment changes are scoped to schools in a contest that coordinator manages. */
export async function canManageSeasonAssignments(db: Database, principal: App.Locals['principal'], seasonId: string, schoolId: string): Promise<boolean> {
	if (!principal) return false;
	if (canAdministerUsers(principal) || canCoordinateState(principal, seasonId)) return true;
	const contests = await db.select({ id: schema.contests.id }).from(schema.contests).where(eq(schema.contests.seasonId, seasonId));
	const managedContestIds = contests.filter((contest) => canCoordinateRegion(principal, contest.id)).map((contest) => contest.id);
	if (!schoolId || managedContestIds.length === 0) return false;
	const [participation] = await db.select({ schoolId: schema.schoolParticipations.schoolId }).from(schema.schoolParticipations)
		.where(and(eq(schema.schoolParticipations.schoolId, schoolId), inArray(schema.schoolParticipations.contestId, managedContestIds)));
	return Boolean(participation);
}
