import { error, fail } from '@sveltejs/kit';
import { canCoordinateState, canCoachSchool } from '$lib/server/auth/capabilities';
import { getDb } from '$lib/server/db';
import { addStateEntryMember, addStateRosterMember, createStateEntry, createStateTeamForBerth, getStateDashboard, removeStateEntryMember, removeStateRosterMember, setStateAttendance, StateError } from '$lib/server/state/service';
import type { Actions, PageServerLoad } from './$types';

function text(data: FormData, name: string) { return String(data.get(name) ?? '').trim(); }
function number(data: FormData, name: string) { return Number(text(data, name)); }
function failure(cause: unknown) { return fail(400, { error: cause instanceof StateError ? cause.message : 'State workflow could not be completed.' }); }

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const dashboard = await getStateDashboard(getDb(platform.env.DB), params.contestId);
	if (!canCoordinateState(locals.principal, dashboard.contest.seasonId) && !locals.principal.coachAssignments.some((assignment) => assignment.seasonId === dashboard.contest.seasonId && dashboard.qualifiedSchools.some((school) => school.schoolId === assignment.schoolId))) throw error(403, 'You cannot view this state contest.');
	return dashboard;
};

export const actions: Actions = {
	setAttendance: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const schoolId = text(data, 'schoolId'); const db = getDb(platform.env.DB); const dashboard = await getStateDashboard(db, params.contestId);
		if (!canCoordinateState(locals.principal, dashboard.contest.seasonId) && !canCoachSchool(locals.principal, schoolId, dashboard.contest.seasonId)) throw error(403, 'You cannot change this school attendance.');
		try { await setStateAttendance(db, { contestId: params.contestId, schoolId, intent: text(data, 'intent') as 'undecided' | 'attending' | 'not_attending', actorUserId: locals.principal.id }); return { success: 'State attendance updated.' }; } catch (cause) { return failure(cause); }
	},
	addRoster: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const schoolId = text(data, 'schoolId'); const db = getDb(platform.env.DB); const dashboard = await getStateDashboard(db, params.contestId);
		if (!canCoordinateState(locals.principal, dashboard.contest.seasonId) && !canCoachSchool(locals.principal, schoolId, dashboard.contest.seasonId)) throw error(403, 'You cannot edit this school state roster.');
		try { await addStateRosterMember(db, { contestId: params.contestId, schoolId, annualStudentId: text(data, 'annualStudentId'), admissionBasis: text(data, 'admissionBasis') as 'individual_qualification' | 'team_berth', qualificationId: text(data, 'qualificationId') || null, stateEntryId: text(data, 'stateEntryId') || null, actorUserId: locals.principal.id }); return { success: 'Student added to the state roster.' }; } catch (cause) { return failure(cause); }
	},
	removeRoster: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const schoolId = text(data, 'schoolId'); const db = getDb(platform.env.DB); const dashboard = await getStateDashboard(db, params.contestId);
		if (!canCoordinateState(locals.principal, dashboard.contest.seasonId) && !canCoachSchool(locals.principal, schoolId, dashboard.contest.seasonId)) throw error(403, 'You cannot edit this school state roster.');
		try { await removeStateRosterMember(db, { contestId: params.contestId, schoolId, annualStudentId: text(data, 'annualStudentId'), actorUserId: locals.principal.id }); return { success: 'Student removed from the state roster.' }; } catch (cause) { return failure(cause); }
	},
	createEntry: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const ownerSchoolId = text(data, 'ownerSchoolId') || null; const db = getDb(platform.env.DB); const dashboard = await getStateDashboard(db, params.contestId);
		if (!canCoordinateState(locals.principal, dashboard.contest.seasonId) && (!ownerSchoolId || !canCoachSchool(locals.principal, ownerSchoolId, dashboard.contest.seasonId))) throw error(403, 'You cannot create this state entry.');
		try { await createStateEntry(db, { contestId: params.contestId, ownerSchoolId, category: text(data, 'category') as never, entryNumber: text(data, 'entryNumber') ? number(data, 'entryNumber') : null, division: number(data, 'division'), actorUserId: locals.principal.id }); return { success: 'State entry created.' }; } catch (cause) { return failure(cause); }
	},
	createTeam: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB); const dashboard = await getStateDashboard(db, params.contestId); if (!canCoordinateState(locals.principal, dashboard.contest.seasonId)) throw error(403, 'Only a statewide coordinator can exercise a team berth.');
		try { await createStateTeamForBerth(db, { contestId: params.contestId, berthId: text(await request.formData(), 'berthId'), actorUserId: locals.principal.id }); return { success: 'State team entry created from the qualified berth.' }; } catch (cause) { return failure(cause); }
	},
	addMember: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const dashboard = await getStateDashboard(db, params.contestId); const entry = dashboard.entries.find((candidate) => candidate.id === text(data, 'entryId'));
		if (!entry || (!canCoordinateState(locals.principal, dashboard.contest.seasonId) && (!entry.ownerSchoolId || !canCoachSchool(locals.principal, entry.ownerSchoolId, dashboard.contest.seasonId)))) throw error(403, 'You cannot edit this state entry.');
		try { await addStateEntryMember(db, { contestId: params.contestId, entryId: entry.id, annualStudentId: text(data, 'annualStudentId'), competingGrade: text(data, 'competingGrade') ? number(data, 'competingGrade') : null, actorUserId: locals.principal.id }); return { success: 'State entry member added.' }; } catch (cause) { return failure(cause); }
	},
	removeMember: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const dashboard = await getStateDashboard(db, params.contestId); const entry = dashboard.entries.find((candidate) => candidate.id === text(data, 'entryId'));
		if (!entry || (!canCoordinateState(locals.principal, dashboard.contest.seasonId) && (!entry.ownerSchoolId || !canCoachSchool(locals.principal, entry.ownerSchoolId, dashboard.contest.seasonId)))) throw error(403, 'You cannot edit this state entry.');
		try { await removeStateEntryMember(db, { contestId: params.contestId, entryId: entry.id, annualStudentId: text(data, 'annualStudentId'), actorUserId: locals.principal.id }); return { success: 'State entry member removed.' }; } catch (cause) { return failure(cause); }
	},
};
