import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { canCoordinateState } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { getQualificationRoundReview } from '$lib/server/qualification/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, params.seasonId));
	if (!season) throw error(404, 'Season not found.');
	const canView = canCoordinateState(locals.principal, season.id) || locals.principal.coachAssignments.some((assignment) => assignment.seasonId === season.id);
	if (!canView) throw error(403, 'You cannot view reports for this season.');
	const contests = await db.select().from(schema.contests).where(eq(schema.contests.seasonId, season.id)).orderBy(asc(schema.contests.startsAt));
	const rounds = await Promise.all((['regional_placements', 'state_cutoff', 'manual_review'] as const).map(async (kind) => ({ kind, review: await getQualificationRoundReview(db, season.id, kind) })));
	return { season, contests, rounds };
};
