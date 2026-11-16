import { getAdHocDashboard, regenerateAdHocTeams } from '$lib/server/state/ad-hoc';
import type { AdHocCategory } from '$lib/ad-hoc';
import { bulkSetStateAttendance, changeStateSchoolAttendance, getStateWorksheet, saveStateWorksheet } from '$lib/server/state/worksheet';
import { error, fail } from '@sveltejs/kit';
import { canCoordinateState, canCoachSchool } from '$lib/server/auth/capabilities';
import { getDb } from '$lib/server/db';
import { addStateEntryMember, addStateRosterMember, createStateEntry, createStateTeamForBerth, getStateDashboard, removeStateEntryMember, removeStateRosterMember, setStateAttendance, StateError } from '$lib/server/state/service';
import { contestAction } from '$lib/server/program/contest-actions';
import type { Actions, PageServerLoad } from './$types';

function text(data: FormData, name: string) { return String(data.get(name) ?? '').trim(); }
function number(data: FormData, name: string) { return Number(text(data, name)); }
function failure(cause: unknown) { return fail(400, { error: cause instanceof StateError ? cause.message : 'State workflow could not be completed.' }); }

export const load: PageServerLoad = async ({ locals, platform, params, url }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const requested = url.searchParams.get('schoolId');
	const coachSchoolIds = new Set(locals.principal.coachAssignments.map((assignment) => assignment.schoolId));
	// A school view only needs that school's rows; only the administrator overview reads the whole contest.
	const dashboard = await getStateDashboard(db, params.contestId, locals.principal.isAdmin ? (requested ? [requested] : undefined) : [...coachSchoolIds]);
	if (canCoordinateState(locals.principal, dashboard.contest.seasonId)) {
		if (requested && !dashboard.qualifiedSchools.some(school => school.schoolId === requested)) throw error(404, 'Qualified school not found.');
		return { ...dashboard, canManageContest: dashboard.seasonStatus !== 'archived', isCoordinator: true, schoolView: Boolean(requested), adHoc: await getAdHocDashboard(db, params.contestId, requested ?? undefined), registration: requested ? await getStateWorksheet(db, params.contestId, requested, dashboard) : null };
	}
	if (!dashboard.qualifiedSchools.some((school) => coachSchoolIds.has(school.schoolId))) throw error(403, 'You cannot view this state contest.');
	const schoolId = requested ?? dashboard.qualifiedSchools.find(s => coachSchoolIds.has(s.schoolId))?.schoolId;
	if (!schoolId || !coachSchoolIds.has(schoolId)) throw error(403, 'You cannot view this school registration.');
	return { ...dashboard, canManageContest: false, isCoordinator: false, schoolView: true, adHoc: await getAdHocDashboard(db, params.contestId, schoolId), registration: await getStateWorksheet(db, params.contestId, schoolId, dashboard) };
};

export const actions: Actions = {
 regenerateAdHoc: async ({ locals, platform, params, request }) => {
  if (!locals.principal) throw error(401, 'Sign in required.');
  if (!platform?.env.DB) throw error(503, 'Database unavailable.');
  const db = getDb(platform.env.DB);
  const dashboard = await getStateDashboard(db, params.contestId);
  if (!canCoordinateState(locals.principal, dashboard.contest.seasonId)) throw error(403, 'State coordinator access required.');
  try {
   const result = await regenerateAdHocTeams(db, { contestId: params.contestId, category: text(await request.formData(), 'category') as AdHocCategory, actorUserId: locals.principal.id });
   return { success: `${result.teams} ad-hoc teams saved.${result.unassigned ? ` ${result.unassigned} students remain unassigned: there are not enough students from other schools to form pairs.` : ''}` };
  } catch (cause) { return failure(cause); }
 },
 bulkAttendance: async ({ locals, platform, params, request }) => {
  if (!locals.principal) throw error(401, 'Sign in required.');
  if (!locals.principal.isAdmin) throw error(403, 'Only state coordinators can update all schools.');
  if (!platform?.env.DB) throw error(503, 'Database unavailable.');
  const intent = text(await request.formData(), 'intent');
  if (intent !== 'attending' && intent !== 'not_attending') return fail(400, { error: 'Choose attending or not attending.' });
  const db = getDb(platform.env.DB);
  const dashboard = await getStateDashboard(db, params.contestId);
  if (dashboard.seasonStatus !== 'state' || dashboard.contest.lifecycle !== 'registration_open') return fail(400, { error: 'State registration is closed.' });
  const { updated, errors } = await bulkSetStateAttendance(db, { contestId: params.contestId, intent, actorUserId: locals.principal.id }, dashboard);
  return { success: `${updated} ${updated === 1 ? 'school' : 'schools'} ${intent === 'attending' ? 'opted in' : 'opted out'}.`, ...(errors.length ? { error: errors.join(' ') } : {}) };
 },
 changeSchoolAttendance: async ({ locals, platform, params, request }) => {
  if (!locals.principal) throw error(401, 'Sign in required.');
  if (!platform?.env.DB) throw error(503, 'Database unavailable.');
  const data = await request.formData(); const schoolId = text(data, 'schoolId'); const change = text(data, 'change');
  if (!locals.principal.isAdmin && !canCoachSchool(locals.principal, schoolId)) throw error(403, 'You cannot change this school registration.');
  if (change !== 'withdraw' && change !== 'resume') return fail(400, { error: 'Choose withdrawal or resume.' });
  if (change === 'withdraw' && data.get('confirmWithdrawal') !== 'yes') return fail(400, { error: 'Confirm that this school will not attend State.' });
  try {
   await changeStateSchoolAttendance(getDb(platform.env.DB), { contestId: params.contestId, schoolId, change, principal: locals.principal });
   return { success: change === 'withdraw' ? 'School marked Not attending. You can resume registration later.' : 'School registration resumed.' };
  } catch (cause) { return failure(cause); }
 },
 saveWorksheet: async ({ locals, platform, params, request }) => {
  if (!locals.principal) throw error(401, 'Sign in required.');
  if (!platform?.env.DB) throw error(503, 'Database unavailable.');
  const data = await request.formData(); const schoolId = text(data, 'schoolId');
  if (!locals.principal.isAdmin && !canCoachSchool(locals.principal, schoolId)) throw error(403, 'You cannot edit this school registration.');
  try {
   await saveStateWorksheet(getDb(platform.env.DB), { contestId: params.contestId, schoolId, rows: JSON.parse(text(data, 'rows')), newStudents: JSON.parse(text(data, 'newStudents') || '[]'), actorUserId: locals.principal.id });
   return { success: 'State registration saved.' };
  } catch (cause) { return failure(cause); }
 },
	updateDate: (event) => contestAction(event, 'state', 'date'),
	advanceLifecycle: (event) => contestAction(event, 'state', 'stage'),
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
		const db = getDb(platform.env.DB); const dashboard = await getStateDashboard(db, params.contestId);
		const berthId = text(await request.formData(), 'berthId');
		const berth = dashboard.teamBerths.find(item => item.berth.id === berthId);
		if (!berth || (!canCoordinateState(locals.principal, dashboard.contest.seasonId) && !canCoachSchool(locals.principal, berth.berth.schoolId, dashboard.contest.seasonId))) throw error(403, 'You cannot create this school’s state team.');
		try { await createStateTeamForBerth(db, { contestId: params.contestId, berthId, actorUserId: locals.principal.id }); return { success: 'State team entry created from the qualified berth.' }; } catch (cause) { return failure(cause); }
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
