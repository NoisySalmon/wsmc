import { getDb, schema } from '$lib/server/db';
import { eq, and, inArray } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import {
	validatePlayUp,
	validateGrade,
	validateTeamAssignment,
	type TeamData,
} from '$lib/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = getDb(platform!.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));
	if (!contest) throw error(404, 'Contest not found');

	const [school] = await db.select().from(schema.schools).where(
		and(eq(schema.schools.id, params.schoolId), eq(schema.schools.contestId, params.contestId))
	);
	if (!school) throw error(404, 'School not found');

	const students = await db.select().from(schema.students).where(eq(schema.students.schoolId, params.schoolId));

	const teamsRaw = await db.select().from(schema.teams).where(eq(schema.teams.schoolId, params.schoolId));

	// Load all team members for this school's teams
	let membersRaw: { teamId: string; studentId: string }[] = [];
	if (teamsRaw.length > 0) {
		membersRaw = await db.select().from(schema.teamMembers).where(
			inArray(schema.teamMembers.teamId, teamsRaw.map((t) => t.id))
		);
	}

	// Build enriched team data with member details
	const teams = teamsRaw.map((t) => {
		const memberIds = membersRaw.filter((m) => m.teamId === t.id).map((m) => m.studentId);
		const members = memberIds.map((sid) => {
			const student = students.find((s) => s.id === sid);
			return {
				studentId: sid,
				name: student?.name ?? '?',
				competingGrade: student?.competingGrade ?? 0,
			};
		});
		return { ...t, members };
	});

	return { contest, school, students, teams };
};

// Helper to load team data for validation
async function loadTeamData(db: ReturnType<typeof getDb>, schoolId: string, contestType: string): Promise<TeamData[]> {
	const teamsRaw = await db.select().from(schema.teams).where(
		and(eq(schema.teams.schoolId, schoolId), eq(schema.teams.contestType, contestType as 'project' | 'team_problem' | 'topical'))
	);
	if (teamsRaw.length === 0) return [];

	const membersRaw = await db.select().from(schema.teamMembers).where(
		inArray(schema.teamMembers.teamId, teamsRaw.map((t) => t.id))
	);

	const studentsInTeams = membersRaw.length > 0
		? await db.select().from(schema.students).where(
			inArray(schema.students.id, membersRaw.map((m) => m.studentId))
		)
		: [];

	return teamsRaw.map((t) => ({
		id: t.id,
		contestType: t.contestType,
		teamNumber: t.teamNumber,
		members: membersRaw
			.filter((m) => m.teamId === t.id)
			.map((m) => ({
				studentId: m.studentId,
				competingGrade: studentsInTeams.find((s) => s.id === m.studentId)?.competingGrade ?? 0,
			})),
	}));
}

export const actions: Actions = {
	// ── Student CRUD ─────────────────────────────────────

	addStudent: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const actualGrade = Number(data.get('actual_grade'));
		const competingGrade = Number(data.get('competing_grade') || actualGrade);

		if (!name) return fail(400, { action: 'addStudent', error: 'Name is required.' });

		const gradeErr = validateGrade(actualGrade);
		if (gradeErr) return fail(400, { action: 'addStudent', error: gradeErr });

		const compGradeErr = validateGrade(competingGrade);
		if (compGradeErr) return fail(400, { action: 'addStudent', error: `Competing grade: ${compGradeErr}` });

		const playUpErr = validatePlayUp(actualGrade, competingGrade);
		if (playUpErr) return fail(400, { action: 'addStudent', error: playUpErr });

		await db.insert(schema.students).values({
			schoolId: params.schoolId,
			name,
			actualGrade,
			competingGrade,
		});

		return { action: 'addStudent', success: true };
	},

	updateStudent: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const studentId = data.get('student_id') as string;
		const name = (data.get('name') as string)?.trim();
		const actualGrade = Number(data.get('actual_grade'));
		const competingGrade = Number(data.get('competing_grade') || actualGrade);

		if (!name) return fail(400, { action: 'updateStudent', error: 'Name is required.', studentId });

		const gradeErr = validateGrade(actualGrade);
		if (gradeErr) return fail(400, { action: 'updateStudent', error: gradeErr, studentId });

		const compGradeErr = validateGrade(competingGrade);
		if (compGradeErr) return fail(400, { action: 'updateStudent', error: `Competing grade: ${compGradeErr}`, studentId });

		const playUpErr = validatePlayUp(actualGrade, competingGrade);
		if (playUpErr) return fail(400, { action: 'updateStudent', error: playUpErr, studentId });

		await db.update(schema.students).set({
			name,
			actualGrade,
			competingGrade,
		}).where(and(eq(schema.students.id, studentId), eq(schema.students.schoolId, params.schoolId)));

		return { action: 'updateStudent', success: true };
	},

	deleteStudent: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const studentId = data.get('student_id') as string;

		// Remove from any teams first
		await db.delete(schema.teamMembers).where(eq(schema.teamMembers.studentId, studentId));

		await db.delete(schema.students).where(
			and(eq(schema.students.id, studentId), eq(schema.students.schoolId, params.schoolId))
		);

		return { action: 'deleteStudent', success: true };
	},

	// ── Knowdown Toggle ──────────────────────────────────

	toggleKnowdown: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const studentId = data.get('student_id') as string;
		const enable = data.get('enable') === '1';

		if (enable) {
			// Check count
			const students = await db.select().from(schema.students).where(eq(schema.students.schoolId, params.schoolId));
			const knowdownCount = students.filter((s) => s.isKnowdown).length;
			if (knowdownCount >= 3) {
				return fail(400, { action: 'toggleKnowdown', error: 'Maximum 3 Knowdown competitors per school.' });
			}
		}

		await db.update(schema.students).set({ isKnowdown: enable }).where(
			and(eq(schema.students.id, studentId), eq(schema.students.schoolId, params.schoolId))
		);

		return { action: 'toggleKnowdown', success: true };
	},

	// ── Team Management ──────────────────────────────────

	createTeam: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const contestType = data.get('contest_type') as 'project' | 'team_problem' | 'topical';

		if (!['project', 'team_problem', 'topical'].includes(contestType)) {
			return fail(400, { action: 'createTeam', error: 'Invalid contest type.' });
		}

		// Find next team number
		const existing = await db.select().from(schema.teams).where(
			and(eq(schema.teams.schoolId, params.schoolId), eq(schema.teams.contestType, contestType))
		);
		const nextNumber = existing.length > 0 ? Math.max(...existing.map((t) => t.teamNumber)) + 1 : 1;

		await db.insert(schema.teams).values({
			schoolId: params.schoolId,
			contestType,
			teamNumber: nextNumber,
		});

		return { action: 'createTeam', success: true };
	},

	addToTeam: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const teamId = data.get('team_id') as string;
		const studentId = data.get('student_id') as string;

		// Load the team
		const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
		if (!team || team.schoolId !== params.schoolId) {
			return fail(400, { action: 'addToTeam', error: 'Team not found.' });
		}

		// Load student
		const [student] = await db.select().from(schema.students).where(
			and(eq(schema.students.id, studentId), eq(schema.students.schoolId, params.schoolId))
		);
		if (!student) return fail(400, { action: 'addToTeam', error: 'Student not found.' });

		// Load all teams of this type for validation
		const allTeams = await loadTeamData(db, params.schoolId, team.contestType);
		const teamData = allTeams.find((t) => t.id === teamId);
		if (!teamData) return fail(400, { action: 'addToTeam', error: 'Team data not found.' });

		const errors = validateTeamAssignment(
			{ id: student.id, name: student.name, actualGrade: student.actualGrade, competingGrade: student.competingGrade, isKnowdown: student.isKnowdown },
			teamData,
			allTeams
		);

		if (errors.length > 0) {
			return fail(400, { action: 'addToTeam', error: errors.join(' '), teamId });
		}

		await db.insert(schema.teamMembers).values({ teamId, studentId });

		return { action: 'addToTeam', success: true };
	},

	removeFromTeam: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const teamId = data.get('team_id') as string;
		const studentId = data.get('student_id') as string;

		await db.delete(schema.teamMembers).where(
			and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.studentId, studentId))
		);

		return { action: 'removeFromTeam', success: true };
	},

	deleteTeam: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const teamId = data.get('team_id') as string;

		// Remove all members first
		await db.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId));
		await db.delete(schema.teams).where(
			and(eq(schema.teams.id, teamId), eq(schema.teams.schoolId, params.schoolId))
		);

		return { action: 'deleteTeam', success: true };
	},

	// ── School Edit (kept from M2) ───────────────────────

	update: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const name = data.get('name') as string;
		const shortName = (data.get('short_name') as string) || '';
		const division = Number(data.get('division'));
		const coachName = (data.get('coach_name') as string) || '';
		const coachEmail = (data.get('coach_email') as string) || '';
		const coachPhone = (data.get('coach_phone') as string) || '';
		const address = (data.get('address') as string) || '';
		const cityZip = (data.get('city_zip') as string) || '';

		if (!name || (division !== 1 && division !== 2)) {
			return fail(400, { action: 'update', error: 'Name is required and division must be 1 or 2.' });
		}

		await db.update(schema.schools).set({
			name, shortName, division, coachName, coachEmail, coachPhone, address, cityZip,
		}).where(eq(schema.schools.id, params.schoolId));

		return { action: 'update', success: true };
	},
};
