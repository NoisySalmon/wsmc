import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '$lib/server/db';
import { getStateRankings, ScoringError } from '$lib/server/scoring/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));
	if (!contest || contest.kind !== 'state' || !contest.resultsPublishedAt) throw error(404, 'Published state results not found.');
	try {
		const result = await getStateRankings(db, contest.id);
		return {
			contest: result.contest,
			rankings: Object.fromEntries(Object.entries(result.rankings).map(([category, rows]) => [category, rows.map((row) => ({ category, division: row.division, rank: row.rank, actualGrade: row.actualGrade, actualGradeRank: row.actualGradeRank ?? null, entryNumber: row.entryNumber, schoolName: row.schoolName, studentName: row.studentName, score: row.score, part1: row.part1, part2: row.part2, placement: row.placement }))])),
		};
	} catch (cause) {
		if (cause instanceof ScoringError) throw error(404, cause.message);
		throw cause;
	}
};
