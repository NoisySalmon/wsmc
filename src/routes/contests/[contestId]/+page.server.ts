import { and, eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { canCoordinateRegion, canScoreContest } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { ProgramError, setContestLifecycle, type ContestLifecycle } from '$lib/server/program/service';
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
		id: entry.id, category: entry.category, categoryLabel: categoryLabels[entry.category], division: entry.division,
		entryNumber: entry.entryNumber, schoolName: schoolShortName || schoolName || 'School not assigned',
		members: membersByEntry.get(entry.id) ?? [],
		complete: _hasCompleteResult(entry.category, result),
	}));
	const categoryCoverage = categories.map((category) => {
		const categoryEntries = entries.filter((entry) => entry.category === category);
		return { category, label: categoryLabels[category], total: categoryEntries.length, complete: categoryEntries.filter((entry) => entry.complete).length };
	});
	const schools = participations.map(({ participation, schoolName, schoolShortName }) => {
		const students = studentsBySchool.get(participation.schoolId) ?? [];
		return { id: participation.schoolId, name: schoolShortName || schoolName, division: participation.division, status: participation.invitationStatus, students };
	}).sort((a, b) => a.name.localeCompare(b.name));
	return {
		contest,
		canAdvanceLifecycle: canCoordinateRegion(locals.principal, contest.id, contest.seasonId),
		canManageStaff: canManageRegionalContestStaff(locals.principal, contest),
		schools,
		entries,
		categoryCoverage,
		rosteredStudentCount: new Set(rosterRows.map((student) => student.studentId)).size,
		completedEntryCount: entries.filter((entry) => entry.complete).length,
		acceptedSchoolCount: schools.filter((school) => school.status === 'accepted').length,
		declinedSchoolCount: schools.filter((school) => school.status === 'declined').length,
		invitedSchoolCount: schools.filter((school) => school.status === 'invited' || school.status === 'pending').length,
	};
};

export const actions: Actions = {
	advanceLifecycle: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));
		if (!contest) throw error(404, 'Contest not found.');
		if (contest.kind !== 'regional' || !canCoordinateRegion(locals.principal, contest.id, contest.seasonId)) throw error(403, 'Regional coordinator access required.');
		const data = await request.formData();
		const next = typeof data.get('lifecycle') === 'string' ? String(data.get('lifecycle')) : '';
		const allowed: Partial<Record<string, ContestLifecycle>> = { registration_open: 'roster_locked', roster_locked: 'scoring' };
		if (allowed[contest.lifecycle] !== next) return fail(400, { error: 'Use the next available contest stage.' });
		try {
			await setContestLifecycle(db, contest.id, contest.seasonId, next as ContestLifecycle);
			return { success: `Contest moved to ${next}.` };
		} catch (cause) {
			return fail(400, { error: cause instanceof ProgramError ? cause.message : 'Contest stage could not be updated.' });
		}
	}
};
