import { assignSchool, removeSchoolParticipation, setParticipationWithdrawn, ParticipationError } from '$lib/server/program/participation';
import { createSchool, SchoolDirectoryError } from '$lib/server/program/schools';
import { getRegistrationReadiness } from '$lib/server/registration/readiness';
import { and, eq } from 'drizzle-orm';
import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { canCoordinateRegion, canScoreContest } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { contestAction } from '$lib/server/program/contest-actions';
import { canManageRegionalContestStaff } from '../contest-staff-access';
import type { Actions, PageServerLoad } from './$types';
import type { Principal } from '$lib/server/auth/capabilities';

const categories = ['project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown'] as const;
const categoryLabels: Record<(typeof categories)[number], string> = {
	project: 'Project', team_contest: 'Team Contest', topical_team: 'Topical Team', topical_individual: 'Topical Individual', knowdown: 'Knowdown'
};

export function _hasCompleteResult(category: string, result: { part1?: number | null; part2?: number | null; score?: number | null; placement?: number | null; knowdownOutcome?: string | null } | null | undefined): boolean {
	if (category === 'topical_team' || category === 'topical_individual') return result?.part1 != null && result?.part2 != null;
	if (category === 'knowdown') return result?.knowdownOutcome === 'eliminated' || (result?.knowdownOutcome === 'placed' && result.placement != null);
	return result?.score != null;
}

export function _canViewRegionalContestOverview(principal: Principal, contest: { id: string; seasonId: string; kind: string }): boolean {
	return contest.kind === 'regional' && canScoreContest(principal, contest.id, contest.seasonId);
}

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));
	if (!contest) throw error(404, 'Contest not found.');
	if (contest.kind !== 'regional') throw error(404, 'Contest overview is available for regional contests.');
	if (!_canViewRegionalContestOverview(locals.principal, contest)) throw error(403, 'You cannot view this contest overview.');

	const [participations, rosterRows, entryRows] = await Promise.all([
		db.select({ participation: schema.schoolParticipations, schoolName: schema.schools.name, schoolShortName: schema.schools.shortName })
			.from(schema.schoolParticipations).innerJoin(schema.schools, eq(schema.schools.id, schema.schoolParticipations.schoolId))
			.where(eq(schema.schoolParticipations.contestId, contest.id)),
		db.select({ schoolId: schema.annualStudents.schoolId, studentId: schema.annualStudents.id, studentName: schema.annualStudents.name, actualGrade: schema.annualStudents.actualGrade })
			.from(schema.contestRosterMembers).innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.contestRosterMembers.annualStudentId))
			.where(eq(schema.contestRosterMembers.contestId, contest.id)),
		db.select({ entry: schema.entries, schoolName: schema.schools.name, schoolShortName: schema.schools.shortName, result: schema.results })
			.from(schema.entries).leftJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId))
			.leftJoin(schema.results, eq(schema.results.entryId, schema.entries.id)).where(eq(schema.entries.contestId, contest.id))
	]);
	const members = entryRows.length ? await db.select({ entryId: schema.entryMembers.entryId, studentName: schema.annualStudents.name, actualGrade: schema.annualStudents.actualGrade, competingGrade: schema.entryMembers.competingGrade })
		.from(schema.entryMembers).innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.entryMembers.annualStudentId))
		.innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).where(eq(schema.entries.contestId, contest.id)) : [];
	const membersByEntry = new Map<string, typeof members>();
	for (const member of members) membersByEntry.set(member.entryId, [...(membersByEntry.get(member.entryId) ?? []), member]);
	const studentsBySchool = new Map<string, typeof rosterRows>();
	for (const student of rosterRows) studentsBySchool.set(student.schoolId, [...(studentsBySchool.get(student.schoolId) ?? []), student]);
	const entries = entryRows.map(({ entry, schoolName, schoolShortName, result }) => ({
		id: entry.id, schoolId: entry.ownerSchoolId, category: entry.category, categoryLabel: categoryLabels[entry.category], division: entry.division,
		entryNumber: entry.entryNumber, schoolName: schoolShortName || schoolName || 'School not assigned',
		members: membersByEntry.get(entry.id) ?? [],
		complete: _hasCompleteResult(entry.category, result),
	}));
	const activeSchoolIds = new Set(participations.filter(p => p.participation.withdrawnAt == null).map(p => p.participation.schoolId));
	const activeEntries = entries.filter(e => e.schoolId && activeSchoolIds.has(e.schoolId));
	const readiness = await getRegistrationReadiness(db, contest.id);
	const categoryCoverage = categories.map((category) => {
		const categoryEntries = activeEntries.filter((entry) => entry.category === category);
		return { category, label: categoryLabels[category], total: categoryEntries.length, complete: categoryEntries.filter((entry) => entry.complete).length };
	});
	const schools = participations.map(({ participation, schoolName, schoolShortName }) => {
		const students = studentsBySchool.get(participation.schoolId) ?? [];
		return { participationId: participation.id, withdrawn: participation.withdrawnAt != null, readiness: readiness.find(r => r.schoolId === participation.schoolId)!, entryCount: entries.filter(e => e.schoolId === participation.schoolId).length, id: participation.schoolId, name: schoolShortName || schoolName, division: participation.division, students };
	}).sort((a, b) => a.name.localeCompare(b.name));
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	const directory = await db.select().from(schema.schools).where(eq(schema.schools.active, true));
	const assignments = await db.select({ schoolId: schema.schoolParticipations.schoolId, contestId: schema.contests.id, contestName: schema.contests.name }).from(schema.schoolParticipations).innerJoin(schema.contests, eq(schema.contests.id, schema.schoolParticipations.contestId)).where(and(eq(schema.contests.seasonId, contest.seasonId), eq(schema.contests.kind, 'regional')));
	return {
		availableSchools: directory.filter(school => !schools.some(s => s.id === school.id)).map(school => ({ id: school.id, name: school.name, city: school.city, division: school.division, assignedTo: assignments.find(a => a.schoolId === school.id)?.contestName ?? null })).sort((a,b) => a.name.localeCompare(b.name)),
		canViewRegions: locals.principal.isAdmin,
		registrationIssueCount: readiness.filter(s => s.status === 'Needs attention').length,
		activeSchoolCount: activeSchoolIds.size,
		contest,
		canManageContest: season.status !== 'archived' && canCoordinateRegion(locals.principal, contest.id, contest.seasonId),
		canManageStaff: canManageRegionalContestStaff(locals.principal, contest),
		schools,
		entries: activeEntries,
		categoryCoverage,
		rosteredStudentCount: new Set(rosterRows.filter(s => activeSchoolIds.has(s.schoolId)).map((student) => student.studentId)).size,
		completedEntryCount: activeEntries.filter((entry) => entry.complete).length,
	};
};

export const actions: Actions = {
	addSchool: (event) => participationAction(event, 'add'),
	removeSchool: (event) => participationAction(event, 'remove'),
	withdrawSchool: (event) => participationAction(event, 'withdraw'),
	restoreSchool: (event) => participationAction(event, 'restore'),
	updateDate: (event) => contestAction(event, 'regional', 'date'),
	advanceLifecycle: (event) => contestAction(event, 'regional', 'stage'),
};

async function participationAction(event: RequestEvent, action: 'add' | 'remove' | 'withdraw' | 'restore') {
	const { locals, platform, params, request } = event;
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId!));
	if (!contest || contest.kind !== 'regional' || !canCoordinateRegion(locals.principal, contest.id, contest.seasonId)) throw error(403, 'Contest coordinator access required.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	if (!season || season.status === 'archived') throw error(409, 'Archived seasons are read-only.');
	const data = await request.formData();
	const value = (name: string) => String(data.get(name) ?? '').trim();
	try {
		if (action === 'add') {
			if (!['setup', 'registration_open'].includes(contest.lifecycle)) throw new ParticipationError('locked', 'Reopen registration before adding a school.');
			if (value('mode') === 'create') {
				await createSchool(db, { name: value('name'), city: value('city'), division: Number(value('division')), contestId: contest.id });
			} else await assignSchool(db, { contestId: contest.id, schoolId: value('schoolId') });
		} else if (action === 'remove') await removeSchoolParticipation(db, { contestId: contest.id, participationId: value('participationId') });
		else await setParticipationWithdrawn(db, { contestId: contest.id, participationId: value('participationId'), withdrawn: action === 'withdraw', actorUserId: locals.principal.id });
		return { success: action === 'add' ? 'School added to this contest.' : action === 'remove' ? 'Participation removed.' : action === 'withdraw' ? 'School withdrawn. Its registration is preserved.' : 'Participation restored with its saved registration.' };
	} catch (cause) {
		return fail(400, { error: cause instanceof ParticipationError || cause instanceof SchoolDirectoryError ? cause.message : 'Participation could not be updated.', addSchoolError: action === 'add' });
	}
}
