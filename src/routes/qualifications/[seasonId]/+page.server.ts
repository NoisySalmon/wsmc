import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { canCoordinateState } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { generateRegionalPlacementQualifications, getQualificationReview, publishRegionalQualifications, QualificationError } from '$lib/server/qualification/service';
import type { Actions, PageServerLoad } from './$types';

function requireAccess(locals: App.Locals, seasonId: string) {
	if (!locals.principal || !canCoordinateState(locals.principal, seasonId)) throw error(403, 'State coordinator access required.');
}

function failure(cause: unknown) { return fail(400, { error: cause instanceof QualificationError ? cause.message : 'Qualification workflow could not be completed.' }); }

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	requireAccess(locals, params.seasonId);
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, params.seasonId));
	if (!season) throw error(404, 'Season not found.');
	const [contests, review] = await Promise.all([
		db.select().from(schema.contests).where(and(eq(schema.contests.seasonId, params.seasonId), eq(schema.contests.kind, 'regional'))),
		getQualificationReview(db, params.seasonId),
	]);
	return { season, contests, review };
};

export const actions: Actions = {
	generate: async ({ locals, platform, params, request }) => {
		requireAccess(locals, params.seasonId);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const contestId = String(data.get('contestId') ?? '').trim();
		const db = getDb(platform.env.DB);
		const [contest] = await db.select().from(schema.contests).where(and(eq(schema.contests.id, contestId), eq(schema.contests.seasonId, params.seasonId), eq(schema.contests.kind, 'regional')));
		if (!contest) return fail(400, { error: 'Choose a regional contest in this season.' });
		try { await generateRegionalPlacementQualifications(db, { contestId, actorUserId: locals.principal!.id }); return { success: 'Regional qualification draft generated.' }; } catch (cause) { return failure(cause); }
	},
	publish: async ({ locals, platform, params }) => {
		requireAccess(locals, params.seasonId);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		try { await publishRegionalQualifications(getDb(platform.env.DB), { seasonId: params.seasonId, actorUserId: locals.principal!.id }); return { success: 'Regional qualification draft published and frozen.' }; } catch (cause) { return failure(cause); }
	},
};
