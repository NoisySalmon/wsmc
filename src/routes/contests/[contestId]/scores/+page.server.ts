import { getDb, schema } from '$lib/server/db';
import { eq, and, inArray } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = getDb(platform!.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));
	if (!contest) throw error(404, 'Contest not found');

	const schools = await db.select().from(schema.schools).where(eq(schema.schools.contestId, params.contestId));
	const schoolIds = schools.map((s) => s.id);
	if (schoolIds.length === 0) {
		return { contest, schools, projectTeams: [], teamProblemTeams: [], topicalTeams: [], topicalIndividuals: [], knowdownEligible: [], knowdownResults: [] };
	}

	const allTeams = await db.select().from(schema.teams).where(inArray(schema.teams.schoolId, schoolIds));
	const allStudents = await db.select().from(schema.students).where(inArray(schema.students.schoolId, schoolIds));

	const teamIds = allTeams.map((t) => t.id);
	let allMembers: { teamId: string; studentId: string }[] = [];
	if (teamIds.length > 0) {
		allMembers = await db.select().from(schema.teamMembers).where(inArray(schema.teamMembers.teamId, teamIds));
	}

	// Load existing scores
	const projectTeamIds = allTeams.filter((t) => t.contestType === 'project').map((t) => t.id);
	const teamProblemTeamIds = allTeams.filter((t) => t.contestType === 'team_problem').map((t) => t.id);
	const topicalTeamIds = allTeams.filter((t) => t.contestType === 'topical').map((t) => t.id);

	const existingProjectScores = projectTeamIds.length > 0
		? await db.select().from(schema.projectScores).where(inArray(schema.projectScores.teamId, projectTeamIds))
		: [];
	const existingTeamProblemScores = teamProblemTeamIds.length > 0
		? await db.select().from(schema.teamProblemScores).where(inArray(schema.teamProblemScores.teamId, teamProblemTeamIds))
		: [];
	const existingTopicalTeamScores = topicalTeamIds.length > 0
		? await db.select().from(schema.topicalTeamScores).where(inArray(schema.topicalTeamScores.teamId, topicalTeamIds))
		: [];

	// Topical individuals = students NOT on a topical team
	const studentsOnTopicalTeam = new Set(
		allMembers.filter((m) => topicalTeamIds.includes(m.teamId)).map((m) => m.studentId)
	);
	const topicalIndividualStudents = allStudents.filter((s) => !studentsOnTopicalTeam.has(s.id));
	const topicalIndividualIds = topicalIndividualStudents.map((s) => s.id);

	const existingTopicalIndividualScores = topicalIndividualIds.length > 0
		? await db.select().from(schema.topicalIndividualScores).where(inArray(schema.topicalIndividualScores.studentId, topicalIndividualIds))
		: [];

	// Knowdown eligible = students with is_knowdown = true
	const knowdownEligible = allStudents.filter((s) => s.isKnowdown);
	const existingKnowdown = await db.select().from(schema.knowdownResults).where(eq(schema.knowdownResults.contestId, params.contestId));

	// Build enriched team data
	function enrichTeam(team: typeof allTeams[0]) {
		const school = schools.find((s) => s.id === team.schoolId);
		const members = allMembers
			.filter((m) => m.teamId === team.id)
			.map((m) => {
				const student = allStudents.find((s) => s.id === m.studentId);
				return { name: student?.name ?? '?', competingGrade: student?.competingGrade ?? 0 };
			});
		return {
			...team,
			schoolName: school?.shortName || school?.name || '?',
			division: school?.division ?? 0,
			members,
		};
	}

	function enrichStudent(student: typeof allStudents[0]) {
		const school = schools.find((s) => s.id === student.schoolId);
		return {
			...student,
			schoolName: school?.shortName || school?.name || '?',
			division: school?.division ?? 0,
		};
	}

	const projectScoreMap = Object.fromEntries(existingProjectScores.map((s) => [s.teamId, s.score]));
	const teamProblemScoreMap = Object.fromEntries(existingTeamProblemScores.map((s) => [s.teamId, s.score]));
	const topicalTeamScoreMap = Object.fromEntries(existingTopicalTeamScores.map((s) => [s.teamId, { part1: s.part1, part2: s.part2 }]));
	const topicalIndividualScoreMap = Object.fromEntries(existingTopicalIndividualScores.map((s) => [s.studentId, { part1: s.part1, part2: s.part2 }]));

	return {
		contest,
		schools,
		projectTeams: allTeams.filter((t) => t.contestType === 'project').map((t) => ({
			...enrichTeam(t),
			score: projectScoreMap[t.id] ?? null,
		})),
		teamProblemTeams: allTeams.filter((t) => t.contestType === 'team_problem').map((t) => ({
			...enrichTeam(t),
			score: teamProblemScoreMap[t.id] ?? null,
		})),
		topicalTeams: allTeams.filter((t) => t.contestType === 'topical').map((t) => ({
			...enrichTeam(t),
			part1: topicalTeamScoreMap[t.id]?.part1 ?? null,
			part2: topicalTeamScoreMap[t.id]?.part2 ?? null,
		})),
		topicalIndividuals: topicalIndividualStudents.map((s) => ({
			...enrichStudent(s),
			part1: topicalIndividualScoreMap[s.id]?.part1 ?? null,
			part2: topicalIndividualScoreMap[s.id]?.part2 ?? null,
		})),
		knowdownEligible: knowdownEligible.map((s) => enrichStudent(s)),
		knowdownResults: existingKnowdown,
	};
};

export const actions: Actions = {
	saveProjectScores: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();

		for (const [key, value] of data.entries()) {
			if (!key.startsWith('score_')) continue;
			const teamId = key.replace('score_', '');
			const scoreStr = (value as string).trim();

			if (scoreStr === '') {
				// Remove score if cleared
				await db.delete(schema.projectScores).where(eq(schema.projectScores.teamId, teamId));
			} else {
				const score = parseFloat(scoreStr);
				if (isNaN(score)) continue;
				const existing = await db.select().from(schema.projectScores).where(eq(schema.projectScores.teamId, teamId));
				if (existing.length > 0) {
					await db.update(schema.projectScores).set({ score }).where(eq(schema.projectScores.teamId, teamId));
				} else {
					await db.insert(schema.projectScores).values({ teamId, score });
				}
			}
		}

		return { tab: 'project', success: true };
	},

	saveTeamProblemScores: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();

		for (const [key, value] of data.entries()) {
			if (!key.startsWith('score_')) continue;
			const teamId = key.replace('score_', '');
			const scoreStr = (value as string).trim();

			if (scoreStr === '') {
				await db.delete(schema.teamProblemScores).where(eq(schema.teamProblemScores.teamId, teamId));
			} else {
				const score = parseFloat(scoreStr);
				if (isNaN(score)) continue;
				const existing = await db.select().from(schema.teamProblemScores).where(eq(schema.teamProblemScores.teamId, teamId));
				if (existing.length > 0) {
					await db.update(schema.teamProblemScores).set({ score }).where(eq(schema.teamProblemScores.teamId, teamId));
				} else {
					await db.insert(schema.teamProblemScores).values({ teamId, score });
				}
			}
		}

		return { tab: 'team_problem', success: true };
	},

	saveTopicalTeamScores: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();

		const teamIds = new Set<string>();
		for (const key of data.keys()) {
			const match = key.match(/^(part1|part2)_(.+)$/);
			if (match) teamIds.add(match[2]);
		}

		for (const teamId of teamIds) {
			const p1Str = (data.get(`part1_${teamId}`) as string)?.trim() ?? '';
			const p2Str = (data.get(`part2_${teamId}`) as string)?.trim() ?? '';

			if (p1Str === '' && p2Str === '') {
				await db.delete(schema.topicalTeamScores).where(eq(schema.topicalTeamScores.teamId, teamId));
			} else {
				const part1 = parseFloat(p1Str) || 0;
				const part2 = parseFloat(p2Str) || 0;
				const existing = await db.select().from(schema.topicalTeamScores).where(eq(schema.topicalTeamScores.teamId, teamId));
				if (existing.length > 0) {
					await db.update(schema.topicalTeamScores).set({ part1, part2 }).where(eq(schema.topicalTeamScores.teamId, teamId));
				} else {
					await db.insert(schema.topicalTeamScores).values({ teamId, part1, part2 });
				}
			}
		}

		return { tab: 'topical_team', success: true };
	},

	saveTopicalIndividualScores: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();

		const studentIds = new Set<string>();
		for (const key of data.keys()) {
			const match = key.match(/^(part1|part2)_(.+)$/);
			if (match) studentIds.add(match[2]);
		}

		for (const studentId of studentIds) {
			const p1Str = (data.get(`part1_${studentId}`) as string)?.trim() ?? '';
			const p2Str = (data.get(`part2_${studentId}`) as string)?.trim() ?? '';

			if (p1Str === '' && p2Str === '') {
				await db.delete(schema.topicalIndividualScores).where(eq(schema.topicalIndividualScores.studentId, studentId));
			} else {
				const part1 = parseFloat(p1Str) || 0;
				const part2 = parseFloat(p2Str) || 0;
				const existing = await db.select().from(schema.topicalIndividualScores).where(eq(schema.topicalIndividualScores.studentId, studentId));
				if (existing.length > 0) {
					await db.update(schema.topicalIndividualScores).set({ part1, part2 }).where(eq(schema.topicalIndividualScores.studentId, studentId));
				} else {
					await db.insert(schema.topicalIndividualScores).values({ studentId, part1, part2 });
				}
			}
		}

		return { tab: 'topical_individual', success: true };
	},

	saveKnowdown: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const contestId = params.contestId;

		// Clear existing results
		await db.delete(schema.knowdownResults).where(eq(schema.knowdownResults.contestId, contestId));

		for (const place of [1, 2, 3, 4]) {
			const studentId = (data.get(`place_${place}`) as string)?.trim();
			if (studentId) {
				await db.insert(schema.knowdownResults).values({ contestId, place, studentId });
			}
		}

		return { tab: 'knowdown', success: true };
	},
};
