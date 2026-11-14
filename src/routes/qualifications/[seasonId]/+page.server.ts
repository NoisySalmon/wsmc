import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { canCoordinateState } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { CutoffError, getQualificationPlanningData, recordManualQualificationDecision } from '$lib/server/qualification/cutoff-service';
import { getQualificationRoundReview } from '$lib/server/qualification/service';
import { getQualificationWorkflow, publishQualificationDraft, saveQualificationDraft } from '$lib/server/qualification/workflow';
import type { Actions, PageServerLoad } from './$types';

function requireAccess(locals: App.Locals, seasonId: string) {
	if (!locals.principal || !canCoordinateState(locals.principal, seasonId)) throw error(403, 'State coordinator access required.');
}
function failure(cause: unknown) { return fail(400, { error: cause instanceof CutoffError ? cause.message : 'Qualification workflow could not be completed.' }); }
function thresholds(data: FormData) {
	const value = (name: string) => { const raw = String(data.get(name) ?? '').trim(); if (!raw) return null; const parsed = Number(raw); if (!Number.isFinite(parsed) || parsed < 0) throw new CutoffError('invalid_threshold', 'Cutoffs must be blank or non-negative numbers.'); return parsed; };
	return { project: value('projectCutoff'), team_contest: { 1: value('teamContestDivision1'), 2: value('teamContestDivision2') }, topical_team: { 1: value('topicalTeamDivision1'), 2: value('topicalTeamDivision2') }, topical_individual: value('topicalIndividualCutoff') };
}
export const load: PageServerLoad = async ({ locals, platform, params }) => {
	requireAccess(locals, params.seasonId);
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, params.seasonId));
	if (!season) throw error(404, 'Season not found.');
	const [planning, workflow, placements, cutoffs, manual] = await Promise.all([
		getQualificationPlanningData(db, params.seasonId), getQualificationWorkflow(db, params.seasonId),
		getQualificationRoundReview(db, params.seasonId, 'regional_placements'),
		getQualificationRoundReview(db, params.seasonId, 'state_cutoff'),
		getQualificationRoundReview(db, params.seasonId, 'manual_review'),
	]);
	let qualifications = [...placements.qualifications, ...cutoffs.qualifications, ...manual.qualifications];
	if (season.status === 'regional') {
		// Live automatic placements only: ignore stored cutoffs and exceptions in preview.
		qualifications = [];
		for (const decision of planning.decisions) {
			const row = planning.rows.find(row => row.entryId === decision.entryId);
			if (!row) continue;
			let qualification = qualifications.find(q => q.entryId === decision.entryId);
			if (!qualification) {
				qualification = {
					id: `preview:${row.entryId}`, roundId: '', seasonId: season.id, entryId: row.entryId,
					studentId: decision.studentId, active: decision.active, createdAt: 0,
					category: row.category, score: row.score, regionNumber: row.regionNumber, regionName: row.regionName,
					actualGrade: row.actualGrade, entryNumber: row.entryNumber, division: row.division,
					schoolName: row.schoolName, studentName: row.studentName, reasons: [],
				};
				qualifications.push(qualification);
			}
			qualification.reasons.push({
				id: `${qualification.id}:${qualification.reasons.length}`, qualificationId: qualification.id,
				kind: decision.kind, rank: decision.rank, scope: decision.scope, actualGrade: decision.actualGrade,
				threshold: null, detailJson: '{}', createdAt: 0,
			});
		}
	}
	return { season, planning, workflow, qualifications };
};

const save: Actions[string] = async ({ locals, platform, params, request }) => {
	requireAccess(locals, params.seasonId);
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	try {
		await saveQualificationDraft(getDb(platform.env.DB), { seasonId: params.seasonId, actorUserId: locals.principal!.id, thresholds: thresholds(await request.formData()) });
		return { success: 'Qualification draft saved, including automatic qualifiers and cutoff additions.' };
	} catch (cause) { return failure(cause); }
};
export const actions: Actions = {
	save,
	publish: async ({ locals, platform, params }) => {
		requireAccess(locals, params.seasonId);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		try { await publishQualificationDraft(getDb(platform.env.DB), { seasonId: params.seasonId, actorUserId: locals.principal!.id }); return { success: 'Qualifications published. The season is now in the state contest stage.' }; } catch (cause) { return failure(cause); }
	},
	manualDecision: async ({ locals, platform, params, request }) => {
		requireAccess(locals, params.seasonId);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		try {
			const db = getDb(platform.env.DB);
			const planning = await getQualificationPlanningData(db, params.seasonId);
			const entryId = String(data.get('entryId') ?? '');
			await recordManualQualificationDecision(db, { seasonId: params.seasonId, entryId, studentId: planning.rows.find(row => row.entryId === entryId)?.studentId, include: data.get('decision') === 'include', reason: String(data.get('reason') ?? ''), actorUserId: locals.principal!.id });
			return { success: 'Exception recorded. Save the draft to apply it to the qualification list.' };
		} catch (cause) { return failure(cause); }
	},
};
