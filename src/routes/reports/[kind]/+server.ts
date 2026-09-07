import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { canCoordinateState } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { exportReportCsv } from '$lib/server/reports/csv';
import { getRegionalRankings, getStateRankings, ScoringError } from '$lib/server/scoring/service';
import { getStateRosterRows } from '$lib/server/state/service';
import type { RequestHandler } from './$types';

const reportKinds = ['schools', 'participation', 'results', 'qualifications', 'state-roster'] as const;
type ReportKind = typeof reportKinds[number];

function isReportKind(value: string): value is ReportKind { return reportKinds.includes(value as ReportKind); }
function required(url: URL, name: string) { const value = url.searchParams.get(name)?.trim(); if (!value) throw error(400, `${name} is required.`); return value; }
function accessToSeason(principal: App.Locals['principal'], seasonId: string) { return Boolean(principal && (canCoordinateState(principal, seasonId) || principal.coachAssignments.some((assignment) => assignment.seasonId === seasonId))); }

export const GET: RequestHandler = async ({ locals, platform, params, url }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	if (!isReportKind(params.kind)) throw error(404, 'Report not found.');
	const db = getDb(platform.env.DB);
	let filename = `wsmc-${params.kind}.csv`;
	let csv: string;

	if (params.kind === 'schools') {
		if (!locals.principal.statewideSeasonIds.length) throw error(403, 'Coordinator access required.');
		const schools = await db.select().from(schema.schools).orderBy(asc(schema.schools.name));
		csv = exportReportCsv(['report_version', 'school_id', 'name', 'short_name', 'address', 'city', 'state', 'postal_code', 'contact_email', 'active'], schools.map((school) => ['wsmc.schools.v1', school.id, school.name, school.shortName, school.address, school.city, school.state, school.postalCode, school.contactEmail, school.active ? 'yes' : 'no']));
	} else if (params.kind === 'participation') {
		const contestId = required(url, 'contestId');
		const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
		if (!contest || !accessToSeason(locals.principal, contest.seasonId)) throw error(403, 'You cannot export this participation report.');
		const rows = await db.select({ participation: schema.schoolParticipations, schoolName: schema.schools.name }).from(schema.schoolParticipations).innerJoin(schema.schools, eq(schema.schools.id, schema.schoolParticipations.schoolId)).where(eq(schema.schoolParticipations.contestId, contestId));
		csv = exportReportCsv(['report_version', 'contest_id', 'school_id', 'school_name', 'division', 'invitation_status'], rows.map(({ participation, schoolName }) => ['wsmc.participation.v1', contestId, participation.schoolId, schoolName, participation.division, participation.invitationStatus]));
		filename = `wsmc-${contestId}-participation.csv`;
	} else if (params.kind === 'results') {
		const contestId = required(url, 'contestId');
		const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
		if (!contest || !accessToSeason(locals.principal, contest.seasonId)) throw error(403, 'You cannot export these results.');
		try {
			const result = contest.kind === 'regional' ? await getRegionalRankings(db, contestId) : await getStateRankings(db, contestId);
			const rows = Object.values(result.rankings).flat().map((row) => ['wsmc.results.v1', contestId, row.category, row.division, row.rank, row.actualGradeRank ?? null, row.schoolName, row.studentName, row.entryNumber, row.score, row.part1, row.part2, row.placement]);
			csv = exportReportCsv(['report_version', 'contest_id', 'category', 'division', 'rank', 'actual_grade_rank', 'school_name', 'student_name', 'entry_number', 'score', 'part1', 'part2', 'placement'], rows);
			filename = `wsmc-${contestId}-results.csv`;
		} catch (cause) { if (cause instanceof ScoringError) throw error(409, cause.message); throw cause; }
	} else if (params.kind === 'qualifications') {
		const seasonId = required(url, 'seasonId');
		if (!accessToSeason(locals.principal, seasonId)) throw error(403, 'You cannot export these qualifications.');
		const qualifications = await db.select({ qualification: schema.qualifications, round: schema.qualificationRounds, entry: schema.entries, schoolName: schema.schools.shortName, studentName: schema.annualStudents.name }).from(schema.qualifications)
			.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
			.innerJoin(schema.entries, eq(schema.entries.id, schema.qualifications.entryId))
			.leftJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId))
			.leftJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.qualifications.studentId))
			.where(and(eq(schema.qualifications.seasonId, seasonId), eq(schema.qualificationRounds.status, 'published')));
		const ids = qualifications.map(({ qualification }) => qualification.id);
		const reasons = ids.length ? await db.select().from(schema.qualificationReasons).where(inArray(schema.qualificationReasons.qualificationId, ids)) : [];
		csv = exportReportCsv(['report_version', 'season_id', 'round_kind', 'round_id', 'qualification_id', 'active', 'entry_id', 'category', 'division', 'school_name', 'student_name', 'reason_kind', 'reason_rank', 'reason_scope', 'actual_grade', 'threshold'], qualifications.flatMap(({ qualification, round, entry, schoolName, studentName }) => {
			const matching = reasons.filter((reason) => reason.qualificationId === qualification.id);
			return (matching.length ? matching : [null]).map((reason) => ['wsmc.qualifications.v1', seasonId, round.kind, round.id, qualification.id, qualification.active ? 'yes' : 'no', entry.id, entry.category, entry.division, schoolName || 'Statewide entry', studentName, reason?.kind ?? null, reason?.rank ?? null, reason?.scope ?? null, reason?.actualGrade ?? null, reason?.threshold ?? null]);
		}));
		filename = `wsmc-${seasonId}-qualifications.csv`;
	} else {
		const contestId = required(url, 'contestId');
		const state = await getStateRosterRows(db, contestId);
		const statewide = canCoordinateState(locals.principal, state.seasonId);
		const schoolId = statewide ? undefined : state.qualifiedSchoolIds.find((candidate) => locals.principal!.coachAssignments.some((assignment) => assignment.seasonId === state.seasonId && assignment.schoolId === candidate));
		if (!statewide && !schoolId) throw error(403, 'You cannot export this state roster.');
		const rows = schoolId ? (await getStateRosterRows(db, contestId, schoolId)).rows : state.rows;
		csv = exportReportCsv(['report_version', 'contest_id', 'school_id', 'school_name', 'annual_student_id', 'student_name', 'actual_grade', 'admission_basis', 'qualification_id', 'state_entry_id'], rows.map((row) => ['wsmc.state-roster.v1', row.contestId, row.schoolId, row.schoolName, row.annualStudentId, row.studentName, row.actualGrade, row.admissionBasis, row.qualificationId, row.stateEntryId]));
		filename = `wsmc-${contestId}-state-roster.csv`;
	}

	return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"` } });
};
