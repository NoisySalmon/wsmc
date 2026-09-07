import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { canScoreContest } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { exportScoreCsvFromDb } from '$lib/server/scoring/csv-service';
import { ScoreCsvError } from '$lib/server/scoring/csv';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform, params }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));
	if (!contest || !canScoreContest(locals.principal, params.contestId, contest.seasonId)) throw error(403, 'You cannot export scores for this contest.');
	try {
		const csv = await exportScoreCsvFromDb(db, params.contestId);
		return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${contest.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'wsmc-scores'}.csv"`, 'cache-control': 'no-store' } });
	} catch (cause) {
		if (cause instanceof ScoreCsvError) throw error(409, cause.message);
		throw cause;
	}
};
