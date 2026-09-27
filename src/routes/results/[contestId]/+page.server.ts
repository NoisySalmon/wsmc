import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { canScoreContest } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { getRegionalRankings, ScoringError } from '$lib/server/scoring/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));
	if (!contest) throw error(404, 'Contest not found.');
	const isCoach = locals.principal.coachAssignments.some((assignment) => assignment.seasonId === contest.seasonId);
	const canReviewUnpublished = canScoreContest(locals.principal, contest.id, contest.seasonId);
	if (!canReviewUnpublished && !isCoach) throw error(403, 'You cannot view these results.');
	if (!canReviewUnpublished && contest.resultsPublishedAt === null) throw error(403, 'These results have not been published for coaches.');
	try {
		const [rankings, registeredEntries] = await Promise.all([
			getRegionalRankings(db, params.contestId),
			db.select({ category: schema.entries.category, division: schema.entries.division }).from(schema.entries).where(eq(schema.entries.contestId, contest.id)),
		]);
		return { ...rankings, registeredEntries, canViewOverview: canReviewUnpublished };
	} catch (cause) {
		if (cause instanceof ScoringError) throw error(409, cause.message);
		throw cause;
	}
};
