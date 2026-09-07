import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { canCoordinateState } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { createStateCutoffDraft, CutoffError, previewStateCutoffRound, publishManualQualificationReview, publishStateCutoffRound, recordManualQualificationDecision } from '$lib/server/qualification/cutoff-service';
import { generateRegionalPlacementQualifications, getQualificationReview, getQualificationRoundReview, publishRegionalQualifications, QualificationError } from '$lib/server/qualification/service';
import type { Actions, PageServerLoad } from './$types';

function requireAccess(locals: App.Locals, seasonId: string) {
	if (!locals.principal || !canCoordinateState(locals.principal, seasonId)) throw error(403, 'State coordinator access required.');
}

function failure(cause: unknown) { return fail(400, { error: cause instanceof QualificationError ? cause.message : 'Qualification workflow could not be completed.' }); }
function cutoffFailure(cause: unknown) { return fail(400, { error: cause instanceof CutoffError ? cause.message : 'Score-cutoff workflow could not be completed.' }); }

function thresholds(data: FormData) {
	const value = (name: string) => { const raw = String(data.get(name) ?? '').trim(); if (!raw) return null; const parsed = Number(raw); if (!Number.isFinite(parsed) || parsed < 0) throw new CutoffError('invalid_threshold', `${name} must be blank or a non-negative number.`); return parsed; };
	return { team_contest: { 1: value('teamContestDivision1'), 2: value('teamContestDivision2') }, topical_team: { 1: value('topicalTeamDivision1'), 2: value('topicalTeamDivision2') }, topical_individual: { 1: value('topicalIndividualDivision1'), 2: value('topicalIndividualDivision2') } };
}

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	requireAccess(locals, params.seasonId);
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, params.seasonId));
	if (!season) throw error(404, 'Season not found.');
	const [contests, review, cutoffReview, manualReview] = await Promise.all([
		db.select().from(schema.contests).where(and(eq(schema.contests.seasonId, params.seasonId), eq(schema.contests.kind, 'regional'))),
		getQualificationReview(db, params.seasonId),
		getQualificationRoundReview(db, params.seasonId, 'state_cutoff'),
		getQualificationRoundReview(db, params.seasonId, 'manual_review'),
	]);
	return { season, contests, review, cutoffReview, manualReview };
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
	previewCutoffs: async ({ locals, platform, params, request }) => {
		requireAccess(locals, params.seasonId);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		try { return { cutoffPreview: await previewStateCutoffRound(getDb(platform.env.DB), { seasonId: params.seasonId, thresholds: thresholds(await request.formData()) }), success: 'Cutoff preview generated. No changes have been saved.' }; } catch (cause) { return cutoffFailure(cause); }
	},
	createCutoffDraft: async ({ locals, platform, params, request }) => {
		requireAccess(locals, params.seasonId);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		try { const result = await createStateCutoffDraft(getDb(platform.env.DB), { seasonId: params.seasonId, actorUserId: locals.principal!.id, thresholds: thresholds(await request.formData()) }); return { cutoffPreview: result.candidates, success: 'State cutoff draft saved. Review the proposed additions before publishing.' }; } catch (cause) { return cutoffFailure(cause); }
	},
	publishCutoffs: async ({ locals, platform, params }) => {
		requireAccess(locals, params.seasonId);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		try { await publishStateCutoffRound(getDb(platform.env.DB), { seasonId: params.seasonId, actorUserId: locals.principal!.id }); return { success: 'State cutoff round published and frozen.' }; } catch (cause) { return cutoffFailure(cause); }
	},
	manualDecision: async ({ locals, platform, params, request }) => {
		requireAccess(locals, params.seasonId);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		try {
			await recordManualQualificationDecision(getDb(platform.env.DB), { seasonId: params.seasonId, entryId: String(data.get('entryId') ?? '').trim(), studentId: String(data.get('studentId') ?? '').trim() || null, include: String(data.get('decision') ?? '') === 'include', reason: String(data.get('reason') ?? ''), actorUserId: locals.principal!.id });
			return { success: 'Manual qualification decision recorded.' };
		} catch (cause) { return cutoffFailure(cause); }
	},
	publishManual: async ({ locals, platform, params }) => {
		requireAccess(locals, params.seasonId);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		try { await publishManualQualificationReview(getDb(platform.env.DB), { seasonId: params.seasonId, actorUserId: locals.principal!.id }); return { success: 'Manual qualification review published and frozen.' }; } catch (cause) { return cutoffFailure(cause); }
	},
	publish: async ({ locals, platform, params }) => {
		requireAccess(locals, params.seasonId);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		try { await publishRegionalQualifications(getDb(platform.env.DB), { seasonId: params.seasonId, actorUserId: locals.principal!.id }); return { success: 'Regional qualification draft published and frozen.' }; } catch (cause) { return failure(cause); }
	},
};
