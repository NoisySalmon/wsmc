import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { addEntryMember, assertContestScope, createEntry, PersistenceRuleError } from '$lib/server/db/repositories';
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

async function requireOpenContest(db: Database, contestId: string) {
	const contest = await requireContest(db, contestId);
	if (contest.lifecycle !== 'registration_open') throw new RegistrationError('locked', 'Registration is not open for this contest.');
	const [season] = await db.select({ status: schema.seasons.status }).from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	if (!season || season.status === 'archived') throw new RegistrationError('locked', 'This season is archived and cannot be edited.');
	return contest;
}

async function requireParticipation(db: Database, contestId: string, schoolId: string) {
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.contestId, contestId), eq(schema.schoolParticipations.schoolId, schoolId)));
	if (!participation) throw new RegistrationError('not_participating', 'School is not participating in this contest.');
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

export async function updateAnnualStudent(db: Database, input: { seasonId: string; schoolId: string; studentId: string; name: string; actualGrade: number; now?: number }) {
	const student = await requireStudent(db, input.seasonId, input.schoolId, input.studentId);
	const name = input.name.trim();
	if (!name) throw new RegistrationError('invalid_name', 'Student name is required.');
	requireGrade(input.actualGrade);
	if (input.actualGrade !== student.actualGrade) {
		const memberships = await db.select({ competingGrade: schema.entryMembers.competingGrade }).from(schema.entryMembers).where(eq(schema.entryMembers.annualStudentId, input.studentId));
		if (memberships.some((member) => member.competingGrade !== null && validatePlayUp(input.actualGrade, member.competingGrade))) throw new RegistrationError('grade_conflict', 'Actual grade cannot exceed an existing competing grade.');
	}
	const [updated] = await db.update(schema.annualStudents).set({ name, actualGrade: input.actualGrade, updatedAt: input.now ?? Date.now() }).where(and(eq(schema.annualStudents.id, input.studentId), eq(schema.annualStudents.seasonId, input.seasonId), eq(schema.annualStudents.schoolId, input.schoolId))).returning();
	return updated;
}

export async function deleteAnnualStudent(db: Database, input: { seasonId: string; schoolId: string; studentId: string }): Promise<void> {
	await requireStudent(db, input.seasonId, input.schoolId, input.studentId);
	const [roster] = await db.select().from(schema.contestRosterMembers).where(eq(schema.contestRosterMembers.annualStudentId, input.studentId));
	if (roster) throw new RegistrationError('student_in_use', 'Remove the student from contest rosters before deleting the annual record.');
	const [entryMember] = await db.select().from(schema.entryMembers).where(eq(schema.entryMembers.annualStudentId, input.studentId));
	if (entryMember) throw new RegistrationError('student_in_use', 'Remove the student from entries before deleting the annual record.');
	await db.delete(schema.annualStudents).where(and(eq(schema.annualStudents.id, input.studentId), eq(schema.annualStudents.seasonId, input.seasonId), eq(schema.annualStudents.schoolId, input.schoolId)));
}

export async function addRosterStudent(db: Database, input: { contestId: string; schoolId: string; studentId: string; now?: number }) {
	const contest = await requireOpenContest(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	await requireStudent(db, contest.seasonId, input.schoolId, input.studentId);
	const now = input.now ?? Date.now();
	const [roster] = await db.insert(schema.contestRosterMembers).values({ contestId: input.contestId, participationId: participation.id, annualStudentId: input.studentId, createdAt: now }).returning();
	return roster;
}

export async function setContestRoster(db: Database, input: { contestId: string; schoolId: string; studentIds: string[]; now?: number }): Promise<{ added: number; removed: number }> {
	const contest = await requireOpenContest(db, input.contestId);
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
	const contest = await requireOpenContest(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const uniqueIds = [...new Set(input.studentIds.filter(Boolean))];
	if (uniqueIds.length > 3) throw new RegistrationError('knowdown_limit', 'A school may designate at most 3 Knowdown competitors.');
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
	const contest = await requireOpenContest(db, input.contestId);
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
	const contest = await requireOpenContest(db, input.contestId);
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
	const contest = await requireOpenContest(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const uniqueIds = [...new Set(input.members.map((member) => member.studentId).filter(Boolean))];
	if (uniqueIds.length === 0) throw new RegistrationError('empty_team', 'Select at least one student for the project team.');
	if (uniqueIds.length > 3) throw new RegistrationError('team_too_large', 'A team may have at most 3 members.');
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
	await requireOpenContest(db, input.contestId);
	await requireParticipation(db, input.contestId, input.schoolId);
	const [entryMember] = await db.select({ entryId: schema.entryMembers.entryId }).from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entryMembers.annualStudentId, input.studentId)));
	if (entryMember) throw new RegistrationError('student_in_entry', 'Remove the student from category entries before removing the roster selection.');
	await db.delete(schema.contestRosterMembers).where(and(eq(schema.contestRosterMembers.contestId, input.contestId), eq(schema.contestRosterMembers.annualStudentId, input.studentId)));
}

export async function createCategoryEntry(db: Database, input: { contestId: string; schoolId: string; category: RegistrationCategory; entryNumber?: number | null; now?: number }) {
	const contest = await requireOpenContest(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	if (input.entryNumber !== undefined && input.entryNumber !== null && (!Number.isInteger(input.entryNumber) || input.entryNumber < 1)) throw new RegistrationError('invalid_entry_number', 'Entry number must be a positive integer.');
	return createEntry(db, { contestId: contest.id, ownerSchoolId: participation.schoolId, category: input.category, entryKind: teamCategories.has(input.category) ? 'team' : 'individual', entryNumber: input.entryNumber ?? null, division: participation.division });
}

export async function addCategoryMember(db: Database, input: { contestId: string; schoolId: string; entryId: string; studentId: string; competingGrade?: number | null }) {
	const contest = await requireOpenContest(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const [entry] = await db.select().from(schema.entries).where(eq(schema.entries.id, input.entryId));
	assertContestScope(entry, input.contestId);
	if (entry.ownerSchoolId !== participation.schoolId) throw new RegistrationError('entry_out_of_scope', 'Entry does not belong to this school.');
	if (entry.category === 'knowdown') {
		const knowdownMembers = await db.select({ studentId: schema.entryMembers.annualStudentId }).from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId), eq(schema.entries.category, 'knowdown')));
		if (!knowdownMembers.some((member) => member.studentId === input.studentId) && knowdownMembers.length >= 3) throw new RegistrationError('knowdown_limit', 'A school may designate at most 3 Knowdown competitors.');
	}
	try {
		return await addEntryMember(db, { contestId: input.contestId, entryId: input.entryId, annualStudentId: input.studentId, competingGrade: input.competingGrade });
	} catch (cause) {
		if (cause instanceof PersistenceRuleError) throw new RegistrationError(cause.code, cause.message);
		throw cause;
	}
}

export async function removeCategoryMember(db: Database, input: { contestId: string; schoolId: string; entryId: string; studentId: string }): Promise<void> {
	await requireOpenContest(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const [entry] = await db.select().from(schema.entries).where(eq(schema.entries.id, input.entryId));
	assertContestScope(entry, input.contestId);
	if (entry.ownerSchoolId !== participation.schoolId) throw new RegistrationError('entry_out_of_scope', 'Entry does not belong to this school.');
	await db.delete(schema.entryMembers).where(and(eq(schema.entryMembers.entryId, input.entryId), eq(schema.entryMembers.annualStudentId, input.studentId)));
}

export async function deleteCategoryEntry(db: Database, input: { contestId: string; schoolId: string; entryId: string }): Promise<void> {
	await requireOpenContest(db, input.contestId);
	const participation = await requireParticipation(db, input.contestId, input.schoolId);
	const [entry] = await db.select().from(schema.entries).where(eq(schema.entries.id, input.entryId));
	assertContestScope(entry, input.contestId);
	if (entry.ownerSchoolId !== participation.schoolId) throw new RegistrationError('entry_out_of_scope', 'Entry does not belong to this school.');
	await db.delete(schema.entries).where(and(eq(schema.entries.id, input.entryId), eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId)));
}

export async function reopenRoster(db: Database, input: { contestId: string; actorUserId: string; reason: string; now?: number }): Promise<void> {
	const reason = input.reason.trim();
	if (!reason) throw new RegistrationError('reason_required', 'A reason is required to reopen a roster.');
	const contest = await requireContest(db, input.contestId);
	if (contest.lifecycle !== 'roster_locked') throw new RegistrationError('invalid_transition', 'Only roster-locked contests can be reopened.');
	const now = input.now ?? Date.now();
	await db.update(schema.contests).set({ lifecycle: 'registration_open', updatedAt: now }).where(and(eq(schema.contests.id, input.contestId), eq(schema.contests.lifecycle, 'roster_locked')));
	await db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'contest', entityId: input.contestId, action: 'roster_reopened', detailsJson: JSON.stringify({ reason, previousLifecycle: 'roster_locked' }), createdAt: now });
}

/** Save the coach's complete worksheet in one transaction after validating every category. */
export async function saveContestWorksheet(
	db: Database,
	input: {
		contestId: string;
		schoolId: string;
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
	const contest = await requireOpenContest(db, input.contestId);
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
	if (knowdown.length > 3)
		throw new RegistrationError(
			'knowdown_limit',
			'Choose at most 3 Knowdown competitors.',
		);
	await guardNoScores(
		db,
		input.contestId,
		input.schoolId,
		registrationCategories,
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
	const operations: any[] = existing.map((entry) =>
		db.delete(schema.entries).where(eq(schema.entries.id, entry.id)),
	);
	operations.push(
		db
			.delete(schema.contestRosterMembers)
			.where(
				and(
					eq(schema.contestRosterMembers.contestId, input.contestId),
					eq(schema.contestRosterMembers.participationId, participation.id),
				),
			),
	);
	for (const student of attending)
		operations.push(
			db
				.insert(schema.contestRosterMembers)
				.values({
					contestId: input.contestId,
					participationId: participation.id,
					annualStudentId: student.studentId,
					createdAt: Date.now(),
				}),
		);
	function entry(
		category: RegistrationCategory,
		number: number,
		members: { studentId: string; competingGrade: number | null }[],
		kind: 'team' | 'individual',
	) {
		const id = crypto.randomUUID();
		operations.push(
			db
				.insert(schema.entries)
				.values({
					id,
					contestId: input.contestId,
					ownerSchoolId: input.schoolId,
					category,
					entryKind: kind,
					entryNumber: number,
					division: participation.division,
				}),
		);
		for (const member of members)
			operations.push(
				db
					.insert(schema.entryMembers)
					.values({
						entryId: id,
						annualStudentId: member.studentId,
						competingGrade: member.competingGrade,
					}),
			);
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
	await db.batch(operations as [any, ...any[]]);
	return { attending: attending.length };
}

export async function addWorksheetStudent(
	db: Database,
	input: {
		contestId: string;
		schoolId: string;
		name: string;
		actualGrade: number;
	},
) {
	const contest = await requireOpenContest(db, input.contestId);
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
