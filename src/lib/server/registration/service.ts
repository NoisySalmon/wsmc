import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { addEntryMember, assertContestScope, createEntry, PersistenceRuleError } from '$lib/server/db/repositories';
import { canCoordinateRegion, type Principal } from '$lib/server/auth/capabilities';
import { validateGrade, validatePlayUp } from '$lib/validation';

export type RegistrationCategory = 'project' | 'team_contest' | 'topical_team' | 'topical_individual' | 'knowdown';
export const registrationCategories: RegistrationCategory[] = ['project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown'];
const teamCategories = new Set<RegistrationCategory>(['project', 'team_contest', 'topical_team']);

export class RegistrationError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'RegistrationError';
	}
}

function requireGrade(grade: number): void {
	const message = validateGrade(grade);
	if (message) throw new RegistrationError('invalid_grade', message);
}

async function requireContest(db: Database, contestId: string) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	if (!contest) throw new RegistrationError('not_found', 'Contest not found.');
	if (contest.kind !== 'regional') throw new RegistrationError('not_regional', 'This registration flow is for regional contests.');
	return contest;
}

export async function requireEditableRegistration(db: Database, contestId: string, principal?: Principal) {
	const contest = await requireContest(db, contestId);
	if (contest.lifecycle !== 'registration_open' && !(principal && canCoordinateRegion(principal, contest.id, contest.seasonId) && ['roster_locked', 'scoring'].includes(contest.lifecycle))) throw new RegistrationError('locked', 'Registration is not open for this contest.');
	await requireRegistrationSeason(db, contest.seasonId, contest.id);
	return contest;
}

async function requireRegistrationSeason(db: Database, seasonId: string, contestId: string) {
	const [season] = await db.select({ status: schema.seasons.status }).from(schema.seasons).where(eq(schema.seasons.id, seasonId));
	if (!season || season.status === 'archived') throw new RegistrationError('locked', 'This season is archived and cannot be edited.');
	const rounds = await db.select({ status: schema.qualificationRounds.status, kind: schema.qualificationRounds.kind }).from(schema.qualificationRounds).where(eq(schema.qualificationRounds.seasonId, seasonId));
	const published = await db.select({ id: schema.qualifications.id }).from(schema.qualifications)
		.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
		.innerJoin(schema.entries, eq(schema.entries.id, schema.qualifications.entryId))
		.where(and(eq(schema.entries.contestId, contestId), eq(schema.qualificationRounds.status, 'published')));
	if (published.length || rounds.some(round => round.status === 'frozen' || (round.kind === 'state_cutoff' && round.status === 'published'))) throw new RegistrationError('qualifications_locked', 'Qualifications are frozen or published. Registration corrections require a separate qualification review.');
}

async function requireParticipation(db: Database, contestId: string, schoolId: string) {
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.contestId, contestId), eq(schema.schoolParticipations.schoolId, schoolId)));
	if (!participation) throw new RegistrationError('not_participating', 'School is not participating in this contest.');
	if (participation.withdrawnAt != null) throw new RegistrationError('withdrawn', 'This school has withdrawn. Restore participation from the contest page before editing.');
	return participation;
}

async function requireStudent(db: Database, seasonId: string, schoolId: string, studentId: string) {
	const [student] = await db.select().from(schema.annualStudents).where(and(eq(schema.annualStudents.id, studentId), eq(schema.annualStudents.seasonId, seasonId), eq(schema.annualStudents.schoolId, schoolId)));
	if (!student) throw new RegistrationError('student_not_found', 'Student is not in this school’s annual list.');
	return student;
}

export async function createAnnualStudent(db: Database, input: { seasonId: string; schoolId: string; name: string; actualGrade: number; now?: number }) {
	const name = input.name.trim();
	if (!name) throw new RegistrationError('invalid_name', 'Student name is required.');
	requireGrade(input.actualGrade);
	const [school] = await db.select({ id: schema.schools.id }).from(schema.schools).where(and(eq(schema.schools.id, input.schoolId), eq(schema.schools.active, true)));
	if (!school) throw new RegistrationError('school_not_found', 'Active school not found.');
	const [season] = await db.select({ id: schema.seasons.id, status: schema.seasons.status }).from(schema.seasons).where(eq(schema.seasons.id, input.seasonId));
	if (!season) throw new RegistrationError('season_not_found', 'Season not found.');
	if (season.status === 'archived') throw new RegistrationError('archived', 'Archived seasons are read-only.');
	const now = input.now ?? Date.now();
	const [student] = await db.insert(schema.annualStudents).values({ id: crypto.randomUUID(), seasonId: input.seasonId, schoolId: input.schoolId, name, actualGrade: input.actualGrade, createdAt: now, updatedAt: now }).returning();
	return student;
}

export async function updateAnnualStudent(db: Database, input: { contestId?: string; principal?: Principal; seasonId: string; schoolId: string; studentId: string; name: string; actualGrade: number; now?: number }) {
	if (input.contestId) await requireEditableRegistration(db, input.contestId, input.principal);
	const student = await requireStudent(db, input.seasonId, input.schoolId, input.studentId);
	const name = input.name.trim();
	if (!name) throw new RegistrationError('invalid_name', 'Student name is required.');
	requireGrade(input.actualGrade);
	if (input.actualGrade !== student.actualGrade) {
		const memberships = await db.select({ competingGrade: schema.entryMembers.competingGrade }).from(schema.entryMembers).where(eq(schema.entryMembers.annualStudentId, input.studentId));
		if (memberships.some((member) => member.competingGrade !== null && validatePlayUp(input.actualGrade, member.competingGrade))) throw new RegistrationError('grade_conflict', 'Actual grade cannot exceed an existing competing grade.');
	}
	const [[updated]] = await db.batch([db.update(schema.annualStudents).set({ name, actualGrade: input.actualGrade, updatedAt: input.now ?? Date.now() }).where(and(eq(schema.annualStudents.id, input.studentId), eq(schema.annualStudents.seasonId, input.seasonId), eq(schema.annualStudents.schoolId, input.schoolId))).returning(), ...(input.principal ? [db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.principal.id, contestId: input.contestId, schoolId: input.schoolId, entityType: 'student', entityId: input.studentId, action: 'registration_student_updated', detailsJson: JSON.stringify({ before: student, after: { name, actualGrade: input.actualGrade } }) })] : [])]);
	return updated;
}

export async function deleteAnnualStudent(db: Database, input: { contestId?: string; principal?: Principal; seasonId: string; schoolId: string; studentId: string }): Promise<void> {
	if (input.contestId) await requireEditableRegistration(db, input.contestId, input.principal);
	const student = await requireStudent(db, input.seasonId, input.schoolId, input.studentId);
	const [roster] = await db.select().from(schema.contestRosterMembers).where(eq(schema.contestRosterMembers.annualStudentId, input.studentId));
	if (roster) throw new RegistrationError('student_in_use', 'Remove the student from contest rosters before deleting the annual record.');
	const [entryMember] = await db.select().from(schema.entryMembers).where(eq(schema.entryMembers.annualStudentId, input.studentId));
	if (entryMember) throw new RegistrationError('student_in_use', 'Remove the student from entries before deleting the annual record.');
	await db.batch([db.delete(schema.annualStudents).where(and(eq(schema.annualStudents.id, input.studentId), eq(schema.annualStudents.seasonId, input.seasonId), eq(schema.annualStudents.schoolId, input.schoolId))), ...(input.principal ? [db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.principal.id, contestId: input.contestId, schoolId: input.schoolId, entityType: 'student', entityId: input.studentId, action: 'registration_student_deleted', detailsJson: JSON.stringify({ before: student }) })] : [])]);
}

export async function addRosterStudent(db: Database, input: { contestId: string; schoolId: string; studentId: string; now?: number }) {
	const contest = await requireEditableRegistration(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	await requireStudent(db, contest.seasonId, input.schoolId, input.studentId);
	const now = input.now ?? Date.now();
	const [roster] = await db.insert(schema.contestRosterMembers).values({ contestId: input.contestId, participationId: participation.id, annualStudentId: input.studentId, createdAt: now }).returning();
	return roster;
}

export async function setContestRoster(db: Database, input: { contestId: string; schoolId: string; studentIds: string[]; now?: number }): Promise<{ added: number; removed: number }> {
	const contest = await requireEditableRegistration(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const uniqueIds = [...new Set(input.studentIds)];
	if (uniqueIds.length > 0) {
		const students = await db.select({ id: schema.annualStudents.id }).from(schema.annualStudents).where(and(eq(schema.annualStudents.seasonId, contest.seasonId), eq(schema.annualStudents.schoolId, input.schoolId)));
		const valid = new Set(students.map((student) => student.id));
		for (const studentId of uniqueIds) {
			if (!valid.has(studentId)) throw new RegistrationError('student_not_found', 'Student is not in this school\u2019s annual list.');
		}
	}
	const current = await db.select({ annualStudentId: schema.contestRosterMembers.annualStudentId }).from(schema.contestRosterMembers).where(eq(schema.contestRosterMembers.contestId, input.contestId));
	const currentIds = new Set(current.map((row) => row.annualStudentId));
	const wanted = new Set(uniqueIds);
	const toAdd = uniqueIds.filter((id) => !currentIds.has(id));
	const toRemove = [...currentIds].filter((id) => !wanted.has(id));
	if (toRemove.length > 0) {
		const inEntries = await db.select({ studentId: schema.entryMembers.annualStudentId }).from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).where(and(eq(schema.entries.contestId, input.contestId), inArray(schema.entryMembers.annualStudentId, toRemove)));
		if (inEntries.length > 0) throw new RegistrationError('student_in_entry', 'Remove the student from category entries before removing the roster selection.');
	}
	const now = input.now ?? Date.now();
	const operations: any[] = [];
	for (const studentId of toAdd) operations.push(db.insert(schema.contestRosterMembers).values({ contestId: input.contestId, participationId: participation.id, annualStudentId: studentId, createdAt: now }));
	for (const studentId of toRemove) operations.push(db.delete(schema.contestRosterMembers).where(and(eq(schema.contestRosterMembers.contestId, input.contestId), eq(schema.contestRosterMembers.annualStudentId, studentId))));
	if (operations.length > 0) await db.batch(operations as [any, ...any[]]);
	return { added: toAdd.length, removed: toRemove.length };
}

export async function setKnowdownNominees(db: Database, input: { contestId: string; schoolId: string; studentIds: string[]; now?: number }): Promise<{ count: number }> {
	const contest = await requireEditableRegistration(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const uniqueIds = [...new Set(input.studentIds.filter(Boolean))];
	if (uniqueIds.length > contest.knowdownLimit) throw new RegistrationError('knowdown_limit', `A school may designate at most ${contest.knowdownLimit} Knowdown competitors.`);
	if (uniqueIds.length > 0) {
		const roster = await db.select({ annualStudentId: schema.contestRosterMembers.annualStudentId }).from(schema.contestRosterMembers).where(eq(schema.contestRosterMembers.contestId, input.contestId));
		const rostered = new Set(roster.map((row) => row.annualStudentId));
		for (const studentId of uniqueIds) {
			if (!rostered.has(studentId)) throw new RegistrationError('student_not_rostered', 'Knowdown nominees must be on the contest roster first.');
		}
		const students = await db.select({ id: schema.annualStudents.id }).from(schema.annualStudents).where(and(eq(schema.annualStudents.seasonId, contest.seasonId), eq(schema.annualStudents.schoolId, input.schoolId)));
		const valid = new Set(students.map((student) => student.id));
		for (const studentId of uniqueIds) {
			if (!valid.has(studentId)) throw new RegistrationError('student_not_found', 'Student is not in this school\u2019s annual list.');
		}
	}
	const existing = await db.select().from(schema.entries).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId), eq(schema.entries.category, 'knowdown')));
	await guardNoScores(db, input.contestId, input.schoolId, ['knowdown']);
	const now = input.now ?? Date.now();
	const operations: any[] = [];
	for (const entry of existing) operations.push(db.delete(schema.entries).where(and(eq(schema.entries.id, entry.id), eq(schema.entries.contestId, input.contestId))));
	const created: { id: string }[] = [];
	uniqueIds.forEach((studentId, index) => {
		const entryId = crypto.randomUUID();
		created.push({ id: entryId });
		operations.push(db.insert(schema.entries).values({ id: entryId, contestId: input.contestId, ownerSchoolId: input.schoolId, category: 'knowdown', entryKind: 'individual', entryNumber: index + 1, division: participation.division }));
		operations.push(db.insert(schema.entryMembers).values({ entryId, annualStudentId: studentId, competingGrade: null }));
	});
	if (operations.length > 0) await db.batch(operations as [any, ...any[]]);
	return { count: uniqueIds.length };
}

// ── Student-first bulk assignment (matrix) ──────────────────────────
// Coaches assign rostered students to teams from the student side; the
// service reconciles category entries. Team Contest and Topical are
// independent groupings: teammates may differ between categories.

export type MatrixTeamAssignment = { studentId: string; team: number | null; competingGrade?: number | null };
export type MatrixTopicalAssignment = { studentId: string; mode: 'unassigned' | 'team' | 'individual'; team?: number | null; competingGrade?: number | null };
type ResolvedMember = { studentId: string; competingGrade: number };

/** Pure planning: group raw team assignments, resolving grades and checking team rules. */
export function resolveTeamGroups(
	studentsById: Map<string, number>,
	assignments: MatrixTeamAssignment[],
): Map<number, ResolvedMember[]> {
	const teams = new Map<number, ResolvedMember[]>();
	for (const assignment of assignments) {
		const actualGrade = studentsById.get(assignment.studentId);
		if (actualGrade === undefined) throw new RegistrationError('student_not_found', 'Student is not in this school\u2019s annual list.');
		if (assignment.team === null || assignment.team === undefined) continue;
		if (!Number.isInteger(assignment.team) || assignment.team < 1) throw new RegistrationError('invalid_team', 'Team number must be a positive integer.');
		const competingGrade = assignment.competingGrade ?? actualGrade;
		requireGrade(competingGrade);
		const playUp = validatePlayUp(actualGrade, competingGrade);
		if (playUp) throw new RegistrationError('playing_down', playUp);
		const group = teams.get(assignment.team) ?? [];
		if (group.length >= 3) throw new RegistrationError('team_too_large', 'A team may have at most 3 members.');
		if (group.some((member) => member.competingGrade === competingGrade)) throw new RegistrationError('duplicate_competing_grade', 'Team members must have distinct competing grades.');
		group.push({ studentId: assignment.studentId, competingGrade });
		teams.set(assignment.team, group);
	}
	return teams;
}

/** Pure planning: split topical assignments into team groups and individual entrants. */
export function planTopicalAssignments(
	studentsById: Map<string, number>,
	assignments: MatrixTopicalAssignment[],
): { teams: Map<number, ResolvedMember[]>; individuals: string[] } {
	const teamInputs: MatrixTeamAssignment[] = [];
	const individuals: string[] = [];
	for (const assignment of assignments) {
		if (!studentsById.has(assignment.studentId)) throw new RegistrationError('student_not_found', 'Student is not in this school\u2019s annual list.');
		if (assignment.mode === 'unassigned') continue;
		if (assignment.mode === 'individual') {
			individuals.push(assignment.studentId);
			continue;
		}
		if (assignment.mode !== 'team') throw new RegistrationError('invalid_assignment', 'Topical assignment must be unassigned, team, or individual.');
		teamInputs.push({ studentId: assignment.studentId, team: assignment.team ?? null, competingGrade: assignment.competingGrade });
	}
	return { teams: resolveTeamGroups(studentsById, teamInputs), individuals };
}

async function loadStudentGrades(db: Database, seasonId: string, schoolId: string): Promise<Map<string, number>> {
	const rows = await db.select({ id: schema.annualStudents.id, actualGrade: schema.annualStudents.actualGrade }).from(schema.annualStudents).where(and(eq(schema.annualStudents.seasonId, seasonId), eq(schema.annualStudents.schoolId, schoolId)));
	return new Map(rows.map((row) => [row.id, row.actualGrade]));
}

async function loadRosteredIds(db: Database, contestId: string): Promise<Set<string>> {
	const rows = await db.select({ annualStudentId: schema.contestRosterMembers.annualStudentId }).from(schema.contestRosterMembers).where(eq(schema.contestRosterMembers.contestId, contestId));
	return new Set(rows.map((row) => row.annualStudentId));
}

/** Bulk saves replace whole entries, so refuse when scores already exist for the category. */
async function guardNoScores(db: Database, contestId: string, schoolId: string, categories: RegistrationCategory[]): Promise<void> {
	const existing = await db.select({ id: schema.entries.id }).from(schema.entries).where(and(eq(schema.entries.contestId, contestId), eq(schema.entries.ownerSchoolId, schoolId), inArray(schema.entries.category, categories)));
	if (existing.length === 0) return;
	const scored = await db.select({ entryId: schema.results.entryId }).from(schema.results).where(inArray(schema.results.entryId, existing.map((entry) => entry.id)));
	if (scored.length > 0) throw new RegistrationError('has_scores', 'Scores are already entered for this category. Edit entries individually instead of bulk-saving.');
}

async function replaceTeamEntries(db: Database, input: { contestId: string; schoolId: string; category: RegistrationCategory; teams: Map<number, ResolvedMember[]>; division: number; now: number }): Promise<{ teams: number; students: number }> {
	const existing = await db.select({ id: schema.entries.id }).from(schema.entries).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId), eq(schema.entries.category, input.category)));
	const operations: any[] = [];
	for (const entry of existing) operations.push(db.delete(schema.entries).where(and(eq(schema.entries.id, entry.id), eq(schema.entries.contestId, input.contestId))));
	const sortedTeams = [...input.teams.entries()].sort((a, b) => a[0] - b[0]);
	let students = 0;
	for (const [teamNumber, members] of sortedTeams) {
		const entryId = crypto.randomUUID();
		operations.push(db.insert(schema.entries).values({ id: entryId, contestId: input.contestId, ownerSchoolId: input.schoolId, category: input.category, entryKind: 'team', entryNumber: teamNumber, division: input.division }));
		for (const member of members) {
			operations.push(db.insert(schema.entryMembers).values({ entryId, annualStudentId: member.studentId, competingGrade: member.competingGrade }));
			students += 1;
		}
	}
	if (operations.length > 0) await db.batch(operations as [any, ...any[]]);
	return { teams: sortedTeams.length, students };
}

export async function saveTeamContestAssignments(db: Database, input: { contestId: string; schoolId: string; assignments: MatrixTeamAssignment[]; now?: number }): Promise<{ teams: number; students: number }> {
	const contest = await requireEditableRegistration(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const studentsById = await loadStudentGrades(db, contest.seasonId, input.schoolId);
	const rostered = await loadRosteredIds(db, input.contestId);
	for (const assignment of input.assignments) {
		if (assignment.team === null || assignment.team === undefined) continue;
		if (!studentsById.has(assignment.studentId)) throw new RegistrationError('student_not_found', 'Student is not in this school\u2019s annual list.');
		if (!rostered.has(assignment.studentId)) throw new RegistrationError('student_not_rostered', 'Team members must be on the contest roster first.');
	}
	await guardNoScores(db, input.contestId, input.schoolId, ['team_contest']);
	const teams = resolveTeamGroups(studentsById, input.assignments);
	return replaceTeamEntries(db, { contestId: input.contestId, schoolId: input.schoolId, category: 'team_contest', teams, division: participation.division, now: input.now ?? Date.now() });
}

export async function saveTopicalAssignments(db: Database, input: { contestId: string; schoolId: string; assignments: MatrixTopicalAssignment[]; now?: number }): Promise<{ teams: number; teamStudents: number; individuals: number }> {
	const contest = await requireEditableRegistration(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const studentsById = await loadStudentGrades(db, contest.seasonId, input.schoolId);
	const rostered = await loadRosteredIds(db, input.contestId);
	for (const assignment of input.assignments) {
		if (assignment.mode === 'unassigned') continue;
		if (!studentsById.has(assignment.studentId)) throw new RegistrationError('student_not_found', 'Student is not in this school\u2019s annual list.');
		if (!rostered.has(assignment.studentId)) throw new RegistrationError('student_not_rostered', 'Topical entrants must be on the contest roster first.');
	}
	await guardNoScores(db, input.contestId, input.schoolId, ['topical_team', 'topical_individual']);
	const plan = planTopicalAssignments(studentsById, input.assignments);
	const now = input.now ?? Date.now();
	const teamResult = await replaceTeamEntries(db, { contestId: input.contestId, schoolId: input.schoolId, category: 'topical_team', teams: plan.teams, division: participation.division, now });
	const existingIndividuals = await db.select({ id: schema.entries.id }).from(schema.entries).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId), eq(schema.entries.category, 'topical_individual')));
	const operations: any[] = [];
	for (const entry of existingIndividuals) operations.push(db.delete(schema.entries).where(and(eq(schema.entries.id, entry.id), eq(schema.entries.contestId, input.contestId))));
	plan.individuals.forEach((studentId, index) => {
		const entryId = crypto.randomUUID();
		operations.push(db.insert(schema.entries).values({ id: entryId, contestId: input.contestId, ownerSchoolId: input.schoolId, category: 'topical_individual', entryKind: 'individual', entryNumber: index + 1, division: participation.division }));
		operations.push(db.insert(schema.entryMembers).values({ entryId, annualStudentId: studentId, competingGrade: null }));
	});
	if (operations.length > 0) await db.batch(operations as [any, ...any[]]);
	return { teams: teamResult.teams, teamStudents: teamResult.students, individuals: plan.individuals.length };
}

export async function createProjectTeam(db: Database, input: { contestId: string; schoolId: string; members: { studentId: string; competingGrade?: number | null }[]; now?: number }): Promise<{ entryNumber: number }> {
	const contest = await requireEditableRegistration(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const uniqueIds = [...new Set(input.members.map((member) => member.studentId).filter(Boolean))];
	if (uniqueIds.length === 0) throw new RegistrationError('empty_team', 'Select at least one student for the project team.');
	if (uniqueIds.length > contest.knowdownLimit) throw new RegistrationError('team_too_large', 'A team may have at most 3 members.');
	const studentsById = await loadStudentGrades(db, contest.seasonId, input.schoolId);
	const rostered = await loadRosteredIds(db, input.contestId);
	const seenGrades = new Set<number>();
	for (const member of input.members) {
		if (!member.studentId) continue;
		if (!studentsById.has(member.studentId)) throw new RegistrationError('student_not_found', 'Student is not in this school\u2019s annual list.');
		if (!rostered.has(member.studentId)) throw new RegistrationError('student_not_rostered', 'Project team members must be on the contest roster first.');
		const competingGrade = member.competingGrade ?? studentsById.get(member.studentId)!;
		requireGrade(competingGrade);
		const playUp = validatePlayUp(studentsById.get(member.studentId)!, competingGrade);
		if (playUp) throw new RegistrationError('playing_down', playUp);
		if (seenGrades.has(competingGrade)) throw new RegistrationError('duplicate_competing_grade', 'Team members must have distinct competing grades.');
		seenGrades.add(competingGrade);
	}
	const alreadyInProject = await db.select({ studentId: schema.entryMembers.annualStudentId }).from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId), eq(schema.entries.category, 'project'), inArray(schema.entryMembers.annualStudentId, uniqueIds)));
	if (alreadyInProject.length > 0) throw new RegistrationError('duplicate_category_entry', 'A student may be in at most one entry in a category.');
	const projectEntries = await db.select({ entryNumber: schema.entries.entryNumber }).from(schema.entries).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId), eq(schema.entries.category, 'project')));
	const entryNumber = Math.max(0, ...projectEntries.map((entry) => entry.entryNumber ?? 0)) + 1;
	const now = input.now ?? Date.now();
	const entryId = crypto.randomUUID();
	await db.batch([
		db.insert(schema.entries).values({ id: entryId, contestId: input.contestId, ownerSchoolId: input.schoolId, category: 'project', entryKind: 'team', entryNumber, division: participation.division }),
		...input.members.filter((member) => member.studentId).map((member) => db.insert(schema.entryMembers).values({ entryId, annualStudentId: member.studentId, competingGrade: member.competingGrade ?? studentsById.get(member.studentId)! })),
	] as [any, ...any[]]);
	return { entryNumber };
}

export async function removeRosterStudent(db: Database, input: { contestId: string; schoolId: string; studentId: string }): Promise<void> {
	await requireEditableRegistration(db, input.contestId);
	await requireParticipation(db, input.contestId, input.schoolId);
	const [entryMember] = await db.select({ entryId: schema.entryMembers.entryId }).from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entryMembers.annualStudentId, input.studentId)));
	if (entryMember) throw new RegistrationError('student_in_entry', 'Remove the student from category entries before removing the roster selection.');
	await db.delete(schema.contestRosterMembers).where(and(eq(schema.contestRosterMembers.contestId, input.contestId), eq(schema.contestRosterMembers.annualStudentId, input.studentId)));
}

export async function createCategoryEntry(db: Database, input: { contestId: string; schoolId: string; category: RegistrationCategory; entryNumber?: number | null; now?: number }) {
	const contest = await requireEditableRegistration(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	if (input.entryNumber !== undefined && input.entryNumber !== null && (!Number.isInteger(input.entryNumber) || input.entryNumber < 1)) throw new RegistrationError('invalid_entry_number', 'Entry number must be a positive integer.');
	return createEntry(db, { contestId: contest.id, ownerSchoolId: participation.schoolId, category: input.category, entryKind: teamCategories.has(input.category) ? 'team' : 'individual', entryNumber: input.entryNumber ?? null, division: participation.division });
}

export async function addCategoryMember(db: Database, input: { contestId: string; schoolId: string; entryId: string; studentId: string; competingGrade?: number | null }) {
	const contest = await requireEditableRegistration(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const [entry] = await db.select().from(schema.entries).where(eq(schema.entries.id, input.entryId));
	assertContestScope(entry, input.contestId);
	if (entry.ownerSchoolId !== participation.schoolId) throw new RegistrationError('entry_out_of_scope', 'Entry does not belong to this school.');
	if (entry.category === 'knowdown') {
		const knowdownMembers = await db.select({ studentId: schema.entryMembers.annualStudentId }).from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId), eq(schema.entries.category, 'knowdown')));
		if (!knowdownMembers.some((member) => member.studentId === input.studentId) && knowdownMembers.length >= contest.knowdownLimit) throw new RegistrationError('knowdown_limit', `A school may designate at most ${contest.knowdownLimit} Knowdown competitors.`);
	}
	try {
		return await addEntryMember(db, { contestId: input.contestId, entryId: input.entryId, annualStudentId: input.studentId, competingGrade: input.competingGrade });
	} catch (cause) {
		if (cause instanceof PersistenceRuleError) throw new RegistrationError(cause.code, cause.message);
		throw cause;
	}
}

export async function removeCategoryMember(db: Database, input: { contestId: string; schoolId: string; entryId: string; studentId: string }): Promise<void> {
	await requireEditableRegistration(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const [entry] = await db.select().from(schema.entries).where(eq(schema.entries.id, input.entryId));
	assertContestScope(entry, input.contestId);
	if (entry.ownerSchoolId !== participation.schoolId) throw new RegistrationError('entry_out_of_scope', 'Entry does not belong to this school.');
	await db.delete(schema.entryMembers).where(and(eq(schema.entryMembers.entryId, input.entryId), eq(schema.entryMembers.annualStudentId, input.studentId)));
}

export async function deleteCategoryEntry(db: Database, input: { contestId: string; schoolId: string; entryId: string }): Promise<void> {
	await requireEditableRegistration(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const [entry] = await db.select().from(schema.entries).where(eq(schema.entries.id, input.entryId));
	assertContestScope(entry, input.contestId);
	if (entry.ownerSchoolId !== participation.schoolId) throw new RegistrationError('entry_out_of_scope', 'Entry does not belong to this school.');
	const [result] = await db.select().from(schema.results).where(eq(schema.results.entryId, entry.id));
	if (result) throw new RegistrationError('has_scores', 'Use the registration worksheet to review and confirm removal of a scored entry.');
	await db.delete(schema.entries).where(and(eq(schema.entries.id, input.entryId), eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId)));
}

export async function reopenRoster(db: Database, input: { contestId: string; actorUserId: string; reason: string; now?: number }): Promise<void> {
	const reason = input.reason.trim();
	if (!reason) throw new RegistrationError('reason_required', 'A reason is required to reopen a roster.');
	const contest = await requireContest(db, input.contestId);
	if (contest.lifecycle !== 'roster_locked') throw new RegistrationError('invalid_transition', 'Only roster-locked contests can be reopened.');
	await requireRegistrationSeason(db, contest.seasonId, contest.id);
	const now = input.now ?? Date.now();
	await db.update(schema.contests).set({ lifecycle: 'registration_open', updatedAt: now }).where(and(eq(schema.contests.id, input.contestId), eq(schema.contests.lifecycle, 'roster_locked')));
	await db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'contest', entityId: input.contestId, action: 'roster_reopened', detailsJson: JSON.stringify({ reason, previousLifecycle: 'roster_locked' }), createdAt: now });
}

export type ScoredRemoval = { entryId: string; category: string; entryNumber: number | null; students: string[]; result: typeof schema.results.$inferSelect };
export class ScoredRemovalError extends RegistrationError {
	constructor(public readonly removals: ScoredRemoval[], public readonly confirmation: string) {
		super('scored_removal', 'These changes remove entries with results. Review and confirm the scores to remove.');
	}
}

/** Reconcile the worksheet atomically, keeping team and student score identities. */
export async function saveContestWorksheet(
	db: Database,
	input: {
		contestId: string;
		schoolId: string;
		principal?: Principal;
		removalConfirmation?: string;
		students: {
			studentId: string;
			attending: boolean;
			team: number | null;
			teamGrade: number | null;
			topical: string;
			topicalGrade: number | null;
			project: number | null;
			projectGrade: number | null;
			knowdown: boolean;
		}[];
	},
) {
	const contest = await requireEditableRegistration(db, input.contestId, input.principal);
	const participation = await requireParticipation(
		db,
		input.contestId,
		input.schoolId,
	);
	const grades = await loadStudentGrades(db, contest.seasonId, input.schoolId);
	if (
		input.students.length !== grades.size ||
		new Set(input.students.map((s) => s.studentId)).size !== grades.size ||
		input.students.some((s) => !grades.has(s.studentId))
	) {
		throw new RegistrationError(
			'stale_students',
			'The student list changed. Refresh the page before saving.',
		);
	}
	const attending = input.students.filter((s) => s.attending);
	const teams = resolveTeamGroups(
		grades,
		attending.map((s) => ({
			studentId: s.studentId,
			team: s.team,
			competingGrade: s.teamGrade,
		})),
	);
	const projects = resolveTeamGroups(
		grades,
		attending.map((s) => ({
			studentId: s.studentId,
			team: s.project,
			competingGrade: s.projectGrade,
		})),
	);
	const topical = planTopicalAssignments(
		grades,
		attending.map((s) => ({
			studentId: s.studentId,
			mode:
				s.topical === 'individual'
					? 'individual'
					: s.topical === ''
						? 'unassigned'
						: 'team',
			team:
				s.topical === 'individual' || s.topical === ''
					? null
					: Number(s.topical),
			competingGrade: s.topicalGrade,
		})),
	);
	const knowdown = attending.filter((s) => s.knowdown).map((s) => s.studentId);
	if (knowdown.length > contest.knowdownLimit)
		throw new RegistrationError(
			'knowdown_limit',
			`Choose at most ${contest.knowdownLimit} Knowdown competitors.`,
		);
	const existing = await db
		.select()
		.from(schema.entries)
		.where(
			and(
				eq(schema.entries.contestId, input.contestId),
				eq(schema.entries.ownerSchoolId, input.schoolId),
			),
		);
	const existingIds = existing.map(entry => entry.id);
	const roster = await db.select().from(schema.contestRosterMembers).where(and(
		eq(schema.contestRosterMembers.contestId, input.contestId),
		eq(schema.contestRosterMembers.participationId, participation.id),
	));
	const members = existingIds.length ? await db.select().from(schema.entryMembers).where(inArray(schema.entryMembers.entryId, existingIds)) : [];
	const results = existingIds.length ? await db.select().from(schema.results).where(inArray(schema.results.entryId, existingIds)) : [];
	type PlannedEntry = { id: string; category: RegistrationCategory; entryNumber: number; entryKind: 'team' | 'individual'; members: { studentId: string; competingGrade: number | null }[] };
	const planned: PlannedEntry[] = [];
	function entry(category: RegistrationCategory, number: number, wantedMembers: PlannedEntry['members'], kind: 'team' | 'individual') {
		const prior = existing.find(e => e.category === category && (kind === 'team'
			? e.entryNumber === number
			: members.some(m => m.entryId === e.id && m.annualStudentId === wantedMembers[0].studentId)));
		planned.push({ id: prior?.id ?? crypto.randomUUID(), category, entryNumber: kind === 'team' ? number : prior?.entryNumber ?? 0, entryKind: kind, members: wantedMembers });
	}
	for (const [category, groups] of [
		['team_contest', teams],
		['topical_team', topical.teams],
		['project', projects],
	] as const) {
		for (const [number, members] of groups)
			entry(category, number, members, 'team');
	}
	topical.individuals.forEach((studentId, i) =>
		entry(
			'topical_individual',
			i + 1,
			[{ studentId, competingGrade: null }],
			'individual',
		),
	);
	knowdown.forEach((studentId, i) =>
		entry(
			'knowdown',
			i + 1,
			[{ studentId, competingGrade: null }],
			'individual',
		),
	);
	// Keep existing individual numbers, and allocate unused numbers only to new entrants.
	for (const category of ['topical_individual', 'knowdown'] as const) {
		const used = new Set(planned.filter(e => e.category === category && e.entryNumber > 0).map(e => e.entryNumber));
		for (const e of planned.filter(e => e.category === category && e.entryNumber === 0)) {
			let number = 1; while (used.has(number)) number++;
			e.entryNumber = number; used.add(number);
		}
	}
	const retained = new Set(planned.map(e => e.id));
	const removed = existing.filter(e => !retained.has(e.id));
	const names = await db.select({ id: schema.annualStudents.id, name: schema.annualStudents.name }).from(schema.annualStudents).where(and(eq(schema.annualStudents.seasonId, contest.seasonId), eq(schema.annualStudents.schoolId, input.schoolId)));
	const removals: ScoredRemoval[] = removed.flatMap(e => {
		const result = results.find(r => r.entryId === e.id);
		return result ? [{ entryId: e.id, category: e.category, entryNumber: e.entryNumber, students: members.filter(m => m.entryId === e.id).map(m => names.find(s => s.id === m.annualStudentId)?.name ?? m.annualStudentId), result }] : [];
	});
	// Confirm exactly the results displayed; a later score edit invalidates this confirmation.
	const confirmation = JSON.stringify(removals.sort((a, b) => a.entryId.localeCompare(b.entryId)));
	if (removals.length && input.removalConfirmation !== confirmation) throw new ScoredRemovalError(removals, confirmation);
	if (removed.length) {
		const qualified = await db.select({ id: schema.qualifications.id }).from(schema.qualifications).where(inArray(schema.qualifications.entryId, removed.map(e => e.id)));
		if (qualified.length) throw new RegistrationError('qualification_reference', 'An entry being removed is included in a qualification draft. Review that draft before removing the entry.');
	}
	const resultMatches = removals.length ? sql.join(removals.map(r => sql`(entry_id = ${r.entryId} AND version = ${r.result.version})`), sql` OR `) : sql`0`;
	const removedIds = removed.length ? sql.join(removed.map(e => sql`${e.id}`), sql`, `) : sql`NULL`;
	const guard = sql`EXISTS (SELECT 1 FROM contests JOIN seasons ON seasons.id = contests.season_id
		WHERE contests.id = ${contest.id} AND contests.lifecycle = ${contest.lifecycle} AND seasons.status <> 'archived')
		AND NOT EXISTS (SELECT 1 FROM qualification_rounds WHERE season_id = ${contest.seasonId} AND (status = 'frozen' OR (kind = 'state_cutoff' AND status = 'published')))
		AND NOT EXISTS (SELECT 1 FROM qualifications JOIN qualification_rounds ON qualification_rounds.id = qualifications.round_id JOIN entries ON entries.id = qualifications.entry_id WHERE entries.contest_id = ${contest.id} AND qualification_rounds.status = 'published')
		AND EXISTS (SELECT 1 FROM school_participations WHERE id = ${participation.id} AND withdrawn_at IS NULL)
		AND (SELECT COUNT(*) FROM results WHERE entry_id IN (${removedIds})) = ${removals.length}
		AND NOT EXISTS (SELECT 1 FROM results WHERE entry_id IN (${removedIds}) AND NOT (${resultMatches}))`;
	const details = JSON.stringify({ before: { entries: existing, members, attendance: roster.map(s => s.annualStudentId) }, after: planned, removedResults: removals, attendance: attending.map(s => s.studentId) });
	// The NOT NULL audit field makes a stale save abort the entire D1 batch, including
	// a score entered between the removal review and this transaction.
	const operations: any[] = [db.insert(schema.auditEvents).values({
		id: crypto.randomUUID(), actorUserId: input.principal?.id, contestId: input.contestId, schoolId: input.schoolId,
		entityType: 'registration', entityId: input.schoolId,
		action: contest.lifecycle === 'registration_open' ? 'registration_saved' : 'registration_corrected',
		detailsJson: sql`CASE WHEN ${guard} THEN ${details} ELSE NULL END`,
	})];
	for (const e of removed) operations.push(db.delete(schema.entries).where(eq(schema.entries.id, e.id)));
	for (const e of planned) {
		if (!existingIds.includes(e.id)) operations.push(db.insert(schema.entries).values({ id: e.id, contestId: input.contestId, ownerSchoolId: input.schoolId, category: e.category, entryKind: e.entryKind, entryNumber: e.entryNumber, division: participation.division }));
		else operations.push(db.delete(schema.entryMembers).where(eq(schema.entryMembers.entryId, e.id)));
		for (const m of e.members) operations.push(db.insert(schema.entryMembers).values({ entryId: e.id, annualStudentId: m.studentId, competingGrade: m.competingGrade }));
	}
	const attendingIds = new Set(attending.map(s => s.studentId));
	const rosterIds = new Set(roster.map(s => s.annualStudentId));
	for (const student of roster.filter(s => !attendingIds.has(s.annualStudentId))) {
		operations.push(db.delete(schema.contestRosterMembers).where(and(
			eq(schema.contestRosterMembers.contestId, input.contestId),
			eq(schema.contestRosterMembers.annualStudentId, student.annualStudentId),
		)));
	}
	for (const student of attending.filter(s => !rosterIds.has(s.studentId))) {
		operations.push(db.insert(schema.contestRosterMembers).values({ contestId: input.contestId, participationId: participation.id, annualStudentId: student.studentId }));
	}
	try { await db.batch(operations as [any, ...any[]]); }
	catch (cause) {
		if (String(cause).includes('audit_events.details_json') || String((cause as Error).cause).includes('audit_events.details_json')) {
			throw new RegistrationError('stale_registration', 'The contest or results changed while saving. Review the latest registration and try again.');
		}
		throw cause;
	}
	return { attending: attending.length };
}

export async function addWorksheetStudent(
	db: Database,
	input: {
		contestId: string;
		schoolId: string;
		principal?: Principal;
		name: string;
		actualGrade: number;
	},
) {
	const contest = await requireEditableRegistration(db, input.contestId, input.principal);
	const participation = await requireParticipation(
		db,
		input.contestId,
		input.schoolId,
	);
	const name = input.name.trim();
	if (!name)
		throw new RegistrationError('invalid_name', 'Student name is required.');
	requireGrade(input.actualGrade);
	const id = crypto.randomUUID();
	const now = Date.now();
	await db.batch([
		db
			.insert(schema.annualStudents)
			.values({
				id,
				seasonId: contest.seasonId,
				schoolId: input.schoolId,
				name,
				actualGrade: input.actualGrade,
				createdAt: now,
				updatedAt: now,
			}),
		...(input.principal ? [db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.principal.id, contestId: input.contestId, schoolId: input.schoolId, entityType: 'student', entityId: id, action: 'registration_student_added', detailsJson: JSON.stringify({ name, actualGrade: input.actualGrade }) })] : []),
		db
			.insert(schema.contestRosterMembers)
			.values({
				contestId: input.contestId,
				participationId: participation.id,
				annualStudentId: id,
				createdAt: now,
			}),
	]);
}
