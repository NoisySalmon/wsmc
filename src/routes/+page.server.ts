import { inArray } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { canAdministerUsers, canCoordinateState, canScoreContest } from '$lib/server/auth/capabilities';
import { createSeason, ProgramError, setSeasonStatus, type SeasonStatus } from '$lib/server/program/service';
import { getDb, schema } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const principal = locals.principal;
	if (!principal || !platform?.env.DB) return { principal, seasons: [], contests: [], regions: [] };
	const db = getDb(platform.env.DB);
	// Administrators see all seasons; others see seasons tied to their assignments.
	const isCoordinator = canAdministerUsers(principal);
	const seasonIds = new Set<string>();
	for (const id of principal.statewideSeasonIds) if (id) seasonIds.add(id);
	for (const assignment of principal.coachAssignments) seasonIds.add(assignment.seasonId);
	let seasons = await db.select({ id: schema.seasons.id, year: schema.seasons.year, status: schema.seasons.status }).from(schema.seasons);
	if (!isCoordinator && seasonIds.size > 0) seasons = seasons.filter((season) => seasonIds.has(season.id));
	seasons = [...seasons].sort((a, b) => {
		const order = (s: string) => (s === 'archived' ? 1 : 0);
		return order(a.status) - order(b.status) || b.year - a.year;
	});
	const visibleSeasonIds = seasons.map((season) => season.id);
	if (visibleSeasonIds.length === 0) return { principal, seasons, contests: [], regions: [] };
	const [contests, regions] = await Promise.all([
		db.select({ id: schema.contests.id, seasonId: schema.contests.seasonId, regionId: schema.contests.regionId, name: schema.contests.name, kind: schema.contests.kind, lifecycle: schema.contests.lifecycle, startsAt: schema.contests.startsAt }).from(schema.contests).where(inArray(schema.contests.seasonId, visibleSeasonIds)),
		db.select({ id: schema.regions.id, seasonId: schema.regions.seasonId, number: schema.regions.number, name: schema.regions.name }).from(schema.regions).where(inArray(schema.regions.seasonId, visibleSeasonIds)),
	]);
	return { principal, seasons, contests: contests.map(contest => ({ ...contest, canOpen: contest.kind === 'regional' && canScoreContest(principal, contest.id, contest.seasonId) })), regions };
};

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


export const actions: Actions = {
	createSeason: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!locals.principal || !canAdministerUsers(locals.principal)) throw error(403, 'Administrator access required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		try {
			await createSeason(getDb(platform.env.DB), { year: numberValue(data, 'year') });
			return { success: 'Season created.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ProgramError ? cause.message : 'Season could not be created.' });
		}
	},
	setSeasonStatus: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const seasonId = textValue(data, 'seasonId');
		if (!canManageSeason(locals, seasonId)) throw error(403, 'You cannot manage this season.');
		const status = textValue(data, 'status');
		if (!['regional', 'qualifications', 'state', 'archived'].includes(status)) return fail(400, { error: 'Choose a valid season status.' });
		try {
			await setSeasonStatus(getDb(platform.env.DB), seasonId, status as SeasonStatus);
			return { success: 'Season status updated.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ProgramError ? cause.message : 'Season status could not be updated.' });
		}
	},
};
