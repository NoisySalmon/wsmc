import { and, eq } from 'drizzle-orm';
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
