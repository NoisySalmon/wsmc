import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { canFinalizeContest, canScoreContest } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { finalizeContest, getFinalizationReport, getScoringSnapshot, publishContestResults, reopenContest, saveContestResult, ScoringError } from '$lib/server/scoring/service';
import type { Actions, PageServerLoad } from './$types';

function text(data: FormData, name: string): string {
	const value = data.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function numberOrNull(data: FormData, name: string): number | null {
	const value = text(data, name);
	return value === '' ? null : Number(value);
}

function expectedVersion(data: FormData): number | undefined {
	const value = text(data, 'expectedVersion');
	return value === '' ? undefined : Number(value);
}

function scoringFailure(cause: unknown) {
	if (cause instanceof ScoringError && cause.code === 'stale_result') return fail(409, { error: cause.message });
	return fail(400, { error: cause instanceof ScoringError ? cause.message : 'Score change could not be saved.' });
}

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const snapshot = await getScoringSnapshot(db, params.contestId);
	if (!canScoreContest(locals.principal, snapshot.contest.id, snapshot.contest.seasonId)) throw error(403, 'You cannot score this contest.');
	const report = await getFinalizationReport(db, params.contestId);
	return {
		contest: snapshot.contest,
		entries: snapshot.entries,
		finalization: report,
		canFinalize: canFinalizeContest(locals.principal, snapshot.contest.id, snapshot.contest.seasonId),
	};
};

export const actions: Actions = {
	saveResult: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		const contestId = params.contestId;
		const data = await request.formData();
		try {
			const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
			if (!contest || !canScoreContest(locals.principal, contestId, contest.seasonId)) throw error(403, 'You cannot score this contest.');
			await saveContestResult(db, { contestId, entryId: text(data, 'entryId'), actorUserId: locals.principal.id, expectedVersion: expectedVersion(data), score: numberOrNull(data, 'score'), part1: numberOrNull(data, 'part1'), part2: numberOrNull(data, 'part2'), placement: numberOrNull(data, 'placement') });
			return { success: 'Score saved.' };
		} catch (cause) {
			if (cause instanceof Response) throw cause;
			return scoringFailure(cause);
		}
	},
	finalize: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		try {
			const report = await getFinalizationReport(db, params.contestId);
			if (!canFinalizeContest(locals.principal, params.contestId, report.contest.seasonId)) throw error(403, 'Only a contest coordinator can finalize results.');
			await finalizeContest(db, { contestId: params.contestId, actorUserId: locals.principal.id });
			return { success: 'Contest finalized. Results remain unpublished until a coordinator publishes them.' };
		} catch (cause) {
			if (cause instanceof Response) throw cause;
			return scoringFailure(cause);
		}
	},
	reopen: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		const data = await request.formData();
		try {
			const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));
			if (!contest || !canFinalizeContest(locals.principal, params.contestId, contest.seasonId)) throw error(403, 'Only a contest coordinator can reopen results.');
			await reopenContest(db, { contestId: params.contestId, actorUserId: locals.principal.id, reason: text(data, 'reason') });
			return { success: 'Contest reopened for scoring corrections.' };
		} catch (cause) {
			if (cause instanceof Response) throw cause;
			return scoringFailure(cause);
		}
	},
	publish: async ({ locals, platform, params }) => {
		if (!locals.principal) throw error(401, 'Sign in required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		try {
			const report = await getFinalizationReport(db, params.contestId);
			if (!canFinalizeContest(locals.principal, params.contestId, report.contest.seasonId)) throw error(403, 'Only a contest coordinator can publish results.');
			await publishContestResults(db, { contestId: params.contestId, actorUserId: locals.principal.id });
			return { success: 'Results published.' };
		} catch (cause) {
			if (cause instanceof Response) throw cause;
			return scoringFailure(cause);
		}
	},
};
