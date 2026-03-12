import { getDb, schema } from '$lib/server/db';
import { eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import {
	rankByScore,
	rankIndividuals,
	type TeamRankingEntry,
	type IndividualRankingEntry,
	type KnowdownEntry,
} from '$lib/rankings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = getDb(platform!.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));
	if (!contest) throw error(404, 'Contest not found');

	const schools = await db.select().from(schema.schools).where(eq(schema.schools.contestId, params.contestId));
	const schoolIds = schools.map((s) => s.id);

	if (schoolIds.length === 0) {
		return { contest, projectRankings: [], teamProblemRankings: [], topicalTeamRankings: [], topicalIndividualRankings: [], knowdownResults: [] };
	}

	const allTeams = await db.select().from(schema.teams).where(inArray(schema.teams.schoolId, schoolIds));
	const allStudents = await db.select().from(schema.students).where(inArray(schema.students.schoolId, schoolIds));

	const teamIds = allTeams.map((t) => t.id);
	let allMembers: { teamId: string; studentId: string }[] = [];
	if (teamIds.length > 0) {
		allMembers = await db.select().from(schema.teamMembers).where(inArray(schema.teamMembers.teamId, teamIds));
	}

	const schoolMap = Object.fromEntries(schools.map((s) => [s.id, s]));
	const studentMap = Object.fromEntries(allStudents.map((s) => [s.id, s]));

	function teamToEntry(team: typeof allTeams[0], score: number): TeamRankingEntry {
		const school = schoolMap[team.schoolId];
		const members = allMembers
			.filter((m) => m.teamId === team.id)
			.map((m) => {
				const s = studentMap[m.studentId];
				return { name: s?.name ?? '?', competingGrade: s?.competingGrade ?? 0 };
			});
		return {
			teamId: team.id,
			schoolName: school?.shortName || school?.name || '?',
			division: school?.division ?? 0,
			teamNumber: team.teamNumber,
			members,
			score,
		};
	}

	// ── Project rankings ──
	const projectTeamIds = allTeams.filter((t) => t.contestType === 'project').map((t) => t.id);
	const projectScores = projectTeamIds.length > 0
		? await db.select().from(schema.projectScores).where(inArray(schema.projectScores.teamId, projectTeamIds))
		: [];
	const projectEntries: TeamRankingEntry[] = projectScores.map((ps) => {
		const team = allTeams.find((t) => t.id === ps.teamId)!;
		return teamToEntry(team, ps.score);
	});

	// ── Team Problem rankings ──
	const tpTeamIds = allTeams.filter((t) => t.contestType === 'team_problem').map((t) => t.id);
	const tpScores = tpTeamIds.length > 0
		? await db.select().from(schema.teamProblemScores).where(inArray(schema.teamProblemScores.teamId, tpTeamIds))
		: [];
	const tpEntries: TeamRankingEntry[] = tpScores.map((ts) => {
		const team = allTeams.find((t) => t.id === ts.teamId)!;
		return teamToEntry(team, ts.score);
	});

	// ── Topical Team rankings ──
	const topTeamIds = allTeams.filter((t) => t.contestType === 'topical').map((t) => t.id);
	const topTeamScores = topTeamIds.length > 0
		? await db.select().from(schema.topicalTeamScores).where(inArray(schema.topicalTeamScores.teamId, topTeamIds))
		: [];
	const topTeamEntries: TeamRankingEntry[] = topTeamScores.map((ts) => {
		const team = allTeams.find((t) => t.id === ts.teamId)!;
		return teamToEntry(team, ts.part1 + ts.part2);
	});

	// ── Topical Individual rankings ──
	const studentsOnTopicalTeam = new Set(
		allMembers.filter((m) => topTeamIds.includes(m.teamId)).map((m) => m.studentId)
	);
	const topIndividualStudentIds = allStudents
		.filter((s) => !studentsOnTopicalTeam.has(s.id))
		.map((s) => s.id);
	const topIndScores = topIndividualStudentIds.length > 0
		? await db.select().from(schema.topicalIndividualScores).where(inArray(schema.topicalIndividualScores.studentId, topIndividualStudentIds))
		: [];
	const indEntries: IndividualRankingEntry[] = topIndScores.map((is) => {
		const student = studentMap[is.studentId];
		const school = student ? schoolMap[student.schoolId] : undefined;
		return {
			studentId: is.studentId,
			name: student?.name ?? '?',
			schoolName: school?.shortName || school?.name || '?',
			division: school?.division ?? 0,
			competingGrade: student?.competingGrade ?? 0,
			part1: is.part1,
			part2: is.part2,
			total: is.part1 + is.part2,
		};
	});

	// ── Knowdown results ──
	const knowdownRaw = await db.select().from(schema.knowdownResults).where(eq(schema.knowdownResults.contestId, params.contestId));
	const knowdownResults: KnowdownEntry[] = knowdownRaw
		.sort((a, b) => a.place - b.place)
		.map((kr) => {
			const student = studentMap[kr.studentId];
			const school = student ? schoolMap[student.schoolId] : undefined;
			return {
				place: kr.place,
				studentName: student?.name ?? '?',
				schoolName: school?.shortName || school?.name || '?',
				division: school?.division ?? 0,
			};
		});

	return {
		contest,
		projectRankings: projectEntries,
		teamProblemRankings: tpEntries,
		topicalTeamRankings: topTeamEntries,
		topicalIndividualRankings: indEntries,
		knowdownResults,
	};
};
