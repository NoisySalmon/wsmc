import { eq, inArray } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { canAdministerUsers, canCoordinateRegion, canCoordinateState } from '$lib/server/auth/capabilities';
import { assignSchool, ParticipationError, removeSchoolParticipation } from '$lib/server/program/participation';
import { getDb, schema } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

function requireCoordinator(locals: App.Locals): void {
	if (!locals.principal || !locals.principal.isAdmin) throw error(403, 'Coordinator access required.');
}

function text(data: FormData, name: string): string {
	const value = data.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function canManageContest(locals: App.Locals, contest: { id: string; seasonId: string }): boolean {
	return Boolean(locals.principal && (canAdministerUsers(locals.principal) || canCoordinateState(locals.principal, contest.seasonId) || canCoordinateRegion(locals.principal, contest.id)));
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireCoordinator(locals);
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [allContests, schools, seasons] = await Promise.all([
		db.select().from(schema.contests),
		db.select().from(schema.schools),
		db.select().from(schema.seasons),
	]);
	const season = seasons.find((season) => season.status !== 'archived');
	const regionalContests = allContests.filter((contest) => contest.kind === 'regional' && contest.seasonId === season?.id);
	const contests = regionalContests.filter((contest) => canManageContest(locals, contest))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
	// Include every region when finding unmapped schools, even for a coordinator
	// who can only manage one contest.
	const regionalIds = regionalContests.map((contest) => contest.id);
	const allParticipations = regionalIds.length ? await db.select().from(schema.schoolParticipations).where(inArray(schema.schoolParticipations.contestId, regionalIds)) : [];
	const assignedSchoolIds = new Set(allParticipations.map((row) => row.schoolId));
	const unmappedSchools = schools.filter((school) => school.active && !assignedSchoolIds.has(school.id))
		.sort((a, b) => a.name.localeCompare(b.name));
	const contestIds = contests.map((contest) => contest.id);
	const participations = allParticipations.filter((row) => contestIds.includes(row.contestId));

	const coachRows = contestIds.length ? await db.select({ userId: schema.coachAssignments.userId, schoolId: schema.coachAssignments.schoolId, displayName: schema.users.displayName, email: schema.users.email })
		.from(schema.coachAssignments)
		.innerJoin(schema.users, eq(schema.users.id, schema.coachAssignments.userId))
		.innerJoin(schema.schoolParticipations, eq(schema.schoolParticipations.schoolId, schema.coachAssignments.schoolId))
		.innerJoin(schema.contests, eq(schema.contests.id, schema.schoolParticipations.contestId))
		.where(inArray(schema.contests.id, contestIds)) : [];
	const coachAssignments = [...new Map(coachRows.map((row) => [`${row.userId}/${row.schoolId}`, row])).values()];
	return { season, contests, schools, unmappedSchools, coachAssignments, participations, canAddSchools: canAdministerUsers(locals.principal!) };
};

export const actions: Actions = {
	assign: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const db = getDb(platform.env.DB);
		const contestId = text(data, 'contestId');
		const [contest] = await db.select({ id: schema.contests.id, seasonId: schema.contests.seasonId }).from(schema.contests).where(eq(schema.contests.id, contestId));
		if (!contest || !canManageContest(locals, contest)) throw error(403, 'You cannot manage this contest.');
		try {
			await assignSchool(db, { contestId, schoolId: text(data, 'schoolId') });
			return { success: 'School assigned to this region.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ParticipationError ? cause.message : 'School could not be assigned.' });
		}
	},
	withdraw: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const db = getDb(platform.env.DB);
		const contestId = text(data, 'contestId');
		const participationId = text(data, 'participationId');
		const [contest] = await db.select({ id: schema.contests.id, seasonId: schema.contests.seasonId }).from(schema.contests).where(eq(schema.contests.id, contestId));
		if (!contest || !canManageContest(locals, contest)) throw error(403, 'You cannot manage this contest.');
		try {
			await removeSchoolParticipation(db, { participationId, contestId });
			return { success: 'School removed from this contest. It can now be assigned to another region.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof ParticipationError ? cause.message : 'School could not be removed.' });
		}
	},
};
