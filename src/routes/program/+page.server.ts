import { and, eq, inArray } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { canAdministerUsers, canCoordinateState } from '$lib/server/auth/capabilities';
import { createContest, createRegion, createSeason, ProgramError, setContestLifecycle, setSeasonStatus, type ContestLifecycle } from '$lib/server/program/service';
import { computeSeasonReadiness } from '$lib/server/program/readiness';
import { getDb, schema } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

function canManageSeason(locals: App.Locals, seasonId: string): boolean {
	return Boolean(locals.principal && (canAdministerUsers(locals.principal) || canCoordinateState(locals.principal, seasonId)));
}

function requireCoordinator(locals: App.Locals): void {
	if (!locals.principal || locals.principal.statewideSeasonIds.length === 0) throw error(403, 'Coordinator access required.');
}

function textValue(data: FormData, name: string): string {
	const value = data.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function numberValue(data: FormData, name: string): number {
	return Number(textValue(data, name));
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireCoordinator(locals);
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const allowed = locals.principal?.statewideSeasonIds.filter((id): id is string => id !== null) ?? [];
	const seasonCondition = canAdministerUsers(locals.principal!) || allowed.length === 0 ? undefined : inArray(schema.seasons.id, allowed);
	const seasons = seasonCondition ? await db.select().from(schema.seasons).where(seasonCondition) : await db.select().from(schema.seasons);
	const seasonIds = seasons.map((season) => season.id);
	const [regions, contests] = seasonIds.length === 0 ? [[], []] : await Promise.all([
		db.select().from(schema.regions).where(inArray(schema.regions.seasonId, seasonIds)),
		db.select().from(schema.contests).where(inArray(schema.contests.seasonId, seasonIds)),
	]);
	const contestIds = contests.map((contest) => contest.id);
	const participations = contestIds.length ? await db.select({ contestId: schema.schoolParticipations.contestId, invitationStatus: schema.schoolParticipations.invitationStatus }).from(schema.schoolParticipations).where(inArray(schema.schoolParticipations.contestId, contestIds)) : [];
	const readiness = seasons.map((season) => computeSeasonReadiness({
		seasonId: season.id,
		regions: regions.filter((region) => region.seasonId === season.id),
		contests: contests.filter((contest) => contest.seasonId === season.id),
		participations: participations.filter((participation) => contests.some((contest) => contest.id === participation.contestId && contest.seasonId === season.id)),
	}));
	return { seasons, regions, contests, readiness };
};

export const actions: Actions = {
	createSeason: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!locals.principal || !canAdministerUsers(locals.principal)) throw error(403, 'System coordinator access required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		try {
			await createSeason(getDb(platform.env.DB), { year: numberValue(data, 'year'), name: textValue(data, 'name') });
			return { success: 'Season created.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ProgramError ? cause.message : 'Season could not be created.' });
		}
	},
	createRegion: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const seasonId = textValue(data, 'seasonId');
		if (!canManageSeason(locals, seasonId)) throw error(403, 'You cannot manage this season.');
		try {
			await createRegion(getDb(platform.env.DB), { seasonId, number: numberValue(data, 'number'), name: textValue(data, 'name') });
			return { success: 'Region created.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ProgramError ? cause.message : 'Region could not be created.' });
		}
	},
	createContest: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const seasonId = textValue(data, 'seasonId');
		if (!canManageSeason(locals, seasonId)) throw error(403, 'You cannot manage this season.');
		const kind = textValue(data, 'kind');
		if (kind !== 'regional' && kind !== 'state') return fail(400, { error: 'Choose a valid contest type.' });
		try {
			await createContest(getDb(platform.env.DB), { seasonId, kind, regionId: textValue(data, 'regionId') || undefined, name: textValue(data, 'name'), startsAt: textValue(data, 'startsAt') ? Date.parse(textValue(data, 'startsAt')) : null, stateSettings: kind === 'state' ? { topicalIndividualAllowed: textValue(data, 'topicalIndividualAllowed') === 'yes', crossSchoolTopicalTeamsAllowed: textValue(data, 'crossSchoolTopicalTeamsAllowed') === 'yes' } : undefined });
			return { success: 'Contest created.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ProgramError ? cause.message : 'Contest could not be created.' });
		}
	},
	setLifecycle: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const contestId = textValue(data, 'contestId');
		const seasonId = textValue(data, 'seasonId');
		if (!canManageSeason(locals, seasonId)) throw error(403, 'You cannot manage this season.');
		const lifecycle = textValue(data, 'lifecycle') as ContestLifecycle;
		if (!['setup', 'registration_open', 'roster_locked', 'scoring', 'finalized'].includes(lifecycle)) return fail(400, { error: 'Choose a valid lifecycle.' });
		try {
			await setContestLifecycle(getDb(platform.env.DB), contestId, lifecycle);
			return { success: 'Contest lifecycle updated.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ProgramError ? cause.message : 'Contest lifecycle could not be updated.' });
		}
	},
	setSeasonStatus: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const seasonId = textValue(data, 'seasonId');
		if (!canManageSeason(locals, seasonId)) throw error(403, 'You cannot manage this season.');
		const status = textValue(data, 'status');
		if (!['setup', 'active', 'archived'].includes(status)) return fail(400, { error: 'Choose a valid season status.' });
		try {
			await setSeasonStatus(getDb(platform.env.DB), seasonId, status as 'setup' | 'active' | 'archived');
			return { success: 'Season status updated.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ProgramError ? cause.message : 'Season status could not be updated.' });
		}
	},
};
