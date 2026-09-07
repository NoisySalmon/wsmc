import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { validateEntryMembership } from '$lib/server/db/repositories';

export type StateCategory = 'project' | 'team_contest' | 'topical_team' | 'topical_individual' | 'knowdown';
const teamCategories = new Set<StateCategory>(['project', 'team_contest', 'topical_team']);

export class StateError extends Error {
	constructor(public readonly code: string, message: string) { super(message); this.name = 'StateError'; }
}

function stateSettings(settingsJson: string): { topicalIndividualAllowed: boolean; crossSchoolTopicalTeamsAllowed: boolean } {
	try {
		const settings = JSON.parse(settingsJson) as Record<string, unknown>;
		if (typeof settings.topicalIndividualAllowed !== 'boolean' || typeof settings.crossSchoolTopicalTeamsAllowed !== 'boolean') throw new Error();
		return { topicalIndividualAllowed: settings.topicalIndividualAllowed, crossSchoolTopicalTeamsAllowed: settings.crossSchoolTopicalTeamsAllowed };
	} catch { throw new StateError('invalid_settings', 'State contest policies must be configured explicitly.'); }
}

async function requireStateContest(db: Database, contestId: string, writable = false) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	if (!contest || contest.kind !== 'state') throw new StateError('not_found', 'State contest not found.');
	if (writable && contest.lifecycle !== 'registration_open') throw new StateError('locked', 'State attendance and entries are locked for this contest.');
	return contest;
}

async function requireQualifiedSchool(db: Database, contestId: string, schoolId: string) {
	const rows = await db.select({ schoolId: schema.entries.ownerSchoolId }).from(schema.qualifications)
		.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
		.innerJoin(schema.entries, eq(schema.entries.id, schema.qualifications.entryId))
		.where(and(eq(schema.qualificationRounds.status, 'published'), eq(schema.qualifications.active, true), eq(schema.qualificationRounds.seasonId, (await requireStateContest(db, contestId)).seasonId)));
	if (!rows.some((row) => row.schoolId === schoolId)) throw new StateError('school_not_qualified', 'This school has no active published qualification.');
}

export async function getStateDashboard(db: Database, contestId: string) {
	const contest = await requireStateContest(db, contestId);
	const [participations, attendance, roster, entries, students] = await Promise.all([
		db.select({ participation: schema.schoolParticipations, school: schema.schools }).from(schema.schoolParticipations).innerJoin(schema.schools, eq(schema.schools.id, schema.schoolParticipations.schoolId)).where(eq(schema.schoolParticipations.contestId, contestId)),
		db.select().from(schema.stateAttendances).where(eq(schema.stateAttendances.contestId, contestId)),
		db.select({ member: schema.stateRosterMembers, student: schema.annualStudents }).from(schema.stateRosterMembers).innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.stateRosterMembers.annualStudentId)).where(eq(schema.stateRosterMembers.contestId, contestId)),
		db.select().from(schema.entries).where(eq(schema.entries.contestId, contestId)),
		db.select({ student: schema.annualStudents, schoolName: schema.schools.shortName }).from(schema.annualStudents).innerJoin(schema.schools, eq(schema.schools.id, schema.annualStudents.schoolId)).where(eq(schema.annualStudents.seasonId, contest.seasonId)),
	]);
	const qualifiedRows = await db.select({ qualification: schema.qualifications, entry: schema.entries, round: schema.qualificationRounds, schoolName: schema.schools.shortName }).from(schema.qualifications)
		.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
		.innerJoin(schema.entries, eq(schema.entries.id, schema.qualifications.entryId))
		.leftJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId))
		.where(and(eq(schema.qualificationRounds.seasonId, contest.seasonId), eq(schema.qualificationRounds.status, 'published'), eq(schema.qualifications.active, true)));
	const qualifiedSchools = [...new Map(qualifiedRows.filter((row) => row.entry.ownerSchoolId).map((row) => [row.entry.ownerSchoolId!, { schoolId: row.entry.ownerSchoolId!, schoolName: row.schoolName || row.entry.ownerSchoolId! }])).values()];
	const stateQualifications = qualifiedRows.map(({ qualification, entry, schoolName }) => ({ id: qualification.id, entryId: entry.id, studentId: qualification.studentId, category: entry.category, division: entry.division, schoolId: entry.ownerSchoolId, schoolName: schoolName || entry.ownerSchoolId || 'Cross-school entry' }));
	const teamBerths = await db.select({ berth: schema.stateTeamBerths, qualification: schema.qualifications })
		.from(schema.stateTeamBerths)
		.innerJoin(schema.qualifications, eq(schema.qualifications.id, schema.stateTeamBerths.qualificationId))
		.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
		.where(and(eq(schema.qualificationRounds.seasonId, contest.seasonId), eq(schema.qualificationRounds.status, 'published'), eq(schema.qualifications.active, true)));
	const entryIds = entries.map((entry) => entry.id);
	const members = entryIds.length ? await db.select({ member: schema.entryMembers, student: schema.annualStudents }).from(schema.entryMembers).innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.entryMembers.annualStudentId)).where(inArray(schema.entryMembers.entryId, entryIds)) : [];
	return { contest, settings: stateSettings(contest.settingsJson), participations, qualifiedSchools, stateQualifications, teamBerths, attendance, roster, entries, members, students: students.map(({ student, schoolName }) => ({ ...student, schoolName: schoolName || student.schoolId })) };
}

export async function getStateRosterRows(db: Database, contestId: string, schoolId?: string) {
	const contest = await requireStateContest(db, contestId);
	const qualifiedRows = await db.select({ schoolId: schema.entries.ownerSchoolId }).from(schema.qualifications)
		.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
		.innerJoin(schema.entries, eq(schema.entries.id, schema.qualifications.entryId))
		.where(and(eq(schema.qualificationRounds.seasonId, contest.seasonId), eq(schema.qualificationRounds.status, 'published'), eq(schema.qualifications.active, true)));
	const qualifiedSchoolIds = [...new Set(qualifiedRows.map((row) => row.schoolId).filter((value): value is string => Boolean(value)))];
	const rosterRows = await db.select({ member: schema.stateRosterMembers, studentName: schema.annualStudents.name, actualGrade: schema.annualStudents.actualGrade, schoolName: schema.schools.shortName })
		.from(schema.stateRosterMembers)
		.innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.stateRosterMembers.annualStudentId))
		.innerJoin(schema.schools, eq(schema.schools.id, schema.stateRosterMembers.schoolId))
		.where(schoolId ? and(eq(schema.stateRosterMembers.contestId, contestId), eq(schema.stateRosterMembers.schoolId, schoolId)) : eq(schema.stateRosterMembers.contestId, contestId));
	return {
		contestId,
		seasonId: contest.seasonId,
		qualifiedSchoolIds,
		rows: rosterRows.map(({ member, studentName, actualGrade, schoolName }) => ({ contestId, schoolId: member.schoolId, schoolName: schoolName || member.schoolId, annualStudentId: member.annualStudentId, studentName, actualGrade, admissionBasis: member.admissionBasis, qualificationId: member.qualificationId, stateEntryId: member.stateEntryId })),
	};
}

export async function setStateAttendance(db: Database, input: { contestId: string; schoolId: string; intent: 'undecided' | 'attending' | 'not_attending'; actorUserId: string; now?: number }) {
	const contest = await requireStateContest(db, input.contestId, true);
	await requireQualifiedSchool(db, contest.id, input.schoolId);
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.contestId, contest.id), eq(schema.schoolParticipations.schoolId, input.schoolId)));
	if (!participation) throw new StateError('not_participating', 'School is not participating in this state contest.');
	const now = input.now ?? Date.now();
	await db.insert(schema.stateAttendances).values({ contestId: contest.id, schoolId: input.schoolId, intent: input.intent, updatedBy: input.actorUserId, updatedAt: now }).onConflictDoUpdate({ target: [schema.stateAttendances.contestId, schema.stateAttendances.schoolId], set: { intent: input.intent, updatedBy: input.actorUserId, updatedAt: now } });
	await db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: contest.id, schoolId: input.schoolId, entityType: 'state_attendance', entityId: `${contest.id}:${input.schoolId}`, action: 'state_attendance_updated', detailsJson: JSON.stringify({ intent: input.intent }), createdAt: now });
}

export async function createStateTeamForBerth(db: Database, input: { contestId: string; berthId: string; actorUserId: string; now?: number }) {
	const contest = await requireStateContest(db, input.contestId, true);
	const [berth] = await db.select({ berth: schema.stateTeamBerths, qualification: schema.qualifications, round: schema.qualificationRounds }).from(schema.stateTeamBerths)
		.innerJoin(schema.qualifications, eq(schema.qualifications.id, schema.stateTeamBerths.qualificationId)).innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
		.where(and(eq(schema.stateTeamBerths.id, input.berthId), eq(schema.qualificationRounds.status, 'published'), eq(schema.qualifications.active, true), eq(schema.qualifications.seasonId, contest.seasonId)));
	if (!berth) throw new StateError('berth_out_of_scope', 'Qualified team berth is not available for this state contest.');
	if (berth.berth.stateEntryId) throw new StateError('already_created', 'This state team berth already has an entry.');
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.contestId, contest.id), eq(schema.schoolParticipations.schoolId, berth.berth.schoolId)));
	if (!participation) throw new StateError('not_participating', 'The qualified school is not participating at state.');
	const now = input.now ?? Date.now();
	const entryId = crypto.randomUUID();
	await db.batch([
		db.insert(schema.entries).values({ id: entryId, contestId: contest.id, ownerSchoolId: berth.berth.schoolId, category: berth.berth.category, entryKind: 'team', entryNumber: null, division: participation.division, createdAt: now, updatedAt: now }),
		db.update(schema.stateTeamBerths).set({ stateEntryId: entryId }).where(eq(schema.stateTeamBerths.id, input.berthId)),
		db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: contest.id, schoolId: berth.berth.schoolId, entityType: 'state_entry', entityId: entryId, action: 'state_team_entry_created', detailsJson: JSON.stringify({ berthId: input.berthId, category: berth.berth.category }), createdAt: now }),
	] as [any, ...any[]]);
	return entryId;
}

export async function addStateRosterMember(db: Database, input: { contestId: string; schoolId: string; annualStudentId: string; admissionBasis: 'individual_qualification' | 'team_berth'; qualificationId?: string | null; stateEntryId?: string | null; actorUserId: string; now?: number }) {
	const contest = await requireStateContest(db, input.contestId, true);
	await requireQualifiedSchool(db, contest.id, input.schoolId);
	const [student] = await db.select().from(schema.annualStudents).where(and(eq(schema.annualStudents.id, input.annualStudentId), eq(schema.annualStudents.seasonId, contest.seasonId), eq(schema.annualStudents.schoolId, input.schoolId)));
	if (!student) throw new StateError('student_out_of_scope', 'Student does not belong to this school and state season.');
	if (input.admissionBasis === 'individual_qualification') {
		if (!input.qualificationId) throw new StateError('qualification_required', 'Individual state admission requires a qualification.');
		const [qualification] = await db.select().from(schema.qualifications)
			.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
			.innerJoin(schema.entries, eq(schema.entries.id, schema.qualifications.entryId))
			.innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId))
			.where(and(eq(schema.qualifications.id, input.qualificationId), eq(schema.qualifications.studentId, student.id), eq(schema.qualifications.active, true), eq(schema.qualificationRounds.status, 'published'), eq(schema.qualifications.seasonId, contest.seasonId), eq(schema.contests.kind, 'regional')));
		if (!qualification) throw new StateError('qualification_out_of_scope', 'This student does not have that active published qualification.');
	} else {
		if (!input.stateEntryId) throw new StateError('state_entry_required', 'Team-berth admission requires a state team entry.');
		const [berth] = await db.select().from(schema.stateTeamBerths)
			.innerJoin(schema.qualifications, eq(schema.qualifications.id, schema.stateTeamBerths.qualificationId))
			.innerJoin(schema.qualificationRounds, eq(schema.qualificationRounds.id, schema.qualifications.roundId))
			.innerJoin(schema.entries, eq(schema.entries.id, schema.stateTeamBerths.stateEntryId))
			.where(and(eq(schema.entries.contestId, contest.id), eq(schema.entries.category, schema.stateTeamBerths.category), eq(schema.stateTeamBerths.stateEntryId, input.stateEntryId), eq(schema.stateTeamBerths.schoolId, input.schoolId), eq(schema.qualifications.active, true), eq(schema.qualificationRounds.status, 'published'), eq(schema.qualifications.seasonId, contest.seasonId)));
		if (!berth) throw new StateError('berth_out_of_scope', 'Student is not supported by this school team berth.');
	}
	const now = input.now ?? Date.now();
	await db.batch([
		db.insert(schema.stateRosterMembers).values({ contestId: contest.id, schoolId: input.schoolId, annualStudentId: student.id, admissionBasis: input.admissionBasis, qualificationId: input.qualificationId ?? null, stateEntryId: input.stateEntryId ?? null, createdAt: now }),
		db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: contest.id, schoolId: input.schoolId, entityType: 'state_roster', entityId: student.id, action: 'state_roster_member_added', detailsJson: JSON.stringify({ admissionBasis: input.admissionBasis, qualificationId: input.qualificationId ?? null, stateEntryId: input.stateEntryId ?? null }), createdAt: now }),
	] as [any, ...any[]]);
}

export async function removeStateRosterMember(db: Database, input: { contestId: string; schoolId: string; annualStudentId: string; actorUserId: string; now?: number }) {
	const contest = await requireStateContest(db, input.contestId, true);
	const [member] = await db.select().from(schema.stateRosterMembers).where(and(eq(schema.stateRosterMembers.contestId, contest.id), eq(schema.stateRosterMembers.schoolId, input.schoolId), eq(schema.stateRosterMembers.annualStudentId, input.annualStudentId)));
	if (!member) throw new StateError('not_found', 'State roster member not found.');
	const [entryMember] = await db.select().from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).where(and(eq(schema.entries.contestId, contest.id), eq(schema.entryMembers.annualStudentId, input.annualStudentId)));
	if (entryMember) throw new StateError('student_in_entry', 'Remove the student from state entries before removing the state roster member.');
	const now = input.now ?? Date.now();
	await db.batch([
		db.delete(schema.stateRosterMembers).where(and(eq(schema.stateRosterMembers.contestId, contest.id), eq(schema.stateRosterMembers.schoolId, input.schoolId), eq(schema.stateRosterMembers.annualStudentId, input.annualStudentId))),
		db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: contest.id, schoolId: input.schoolId, entityType: 'state_roster', entityId: input.annualStudentId, action: 'state_roster_member_removed', detailsJson: '{}', createdAt: now }),
	] as [any, ...any[]]);
}

export async function createStateEntry(db: Database, input: { contestId: string; ownerSchoolId?: string | null; category: StateCategory; entryNumber?: number | null; division: number; actorUserId: string; now?: number }) {
	const contest = await requireStateContest(db, input.contestId, true);
	const settings = stateSettings(contest.settingsJson);
	if (input.category === 'topical_individual' && !settings.topicalIndividualAllowed) throw new StateError('policy_blocked', 'This state contest does not allow Topical Individual.');
	if (!Number.isInteger(input.division) || (input.division !== 1 && input.division !== 2)) throw new StateError('invalid_division', 'Division must be 1 or 2.');
	if (!input.ownerSchoolId && input.category !== 'team_contest') throw new StateError('school_required', 'Only cross-school Team Contest entries may omit an owner school.');
	if (!input.ownerSchoolId && input.category === 'topical_team' && !settings.crossSchoolTopicalTeamsAllowed) throw new StateError('policy_blocked', 'This state contest does not allow cross-school Topical Teams.');
	if (input.ownerSchoolId) {
		await requireQualifiedSchool(db, contest.id, input.ownerSchoolId);
		const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.contestId, contest.id), eq(schema.schoolParticipations.schoolId, input.ownerSchoolId)));
		if (!participation || participation.division !== input.division) throw new StateError('division_mismatch', 'School entry division must match state participation.');
	}
	if (input.entryNumber !== undefined && input.entryNumber !== null && (!Number.isInteger(input.entryNumber) || input.entryNumber < 1)) throw new StateError('invalid_entry_number', 'Entry number must be a positive integer.');
	const id = crypto.randomUUID();
	const now = input.now ?? Date.now();
	await db.batch([
		db.insert(schema.entries).values({ id, contestId: contest.id, ownerSchoolId: input.ownerSchoolId ?? null, category: input.category, entryKind: teamCategories.has(input.category) ? 'team' : 'individual', entryNumber: input.entryNumber ?? null, division: input.division, createdAt: now, updatedAt: now }),
		db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: contest.id, schoolId: input.ownerSchoolId ?? null, entityType: 'state_entry', entityId: id, action: 'state_entry_created', detailsJson: JSON.stringify({ category: input.category, division: input.division, ownerSchoolId: input.ownerSchoolId ?? null }), createdAt: now }),
	] as [any, ...any[]]);
	return id;
}

export async function addStateEntryMember(db: Database, input: { contestId: string; entryId: string; annualStudentId: string; competingGrade?: number | null; actorUserId: string; now?: number }) {
	const contest = await requireStateContest(db, input.contestId, true);
	const [entry] = await db.select().from(schema.entries).where(and(eq(schema.entries.id, input.entryId), eq(schema.entries.contestId, contest.id)));
	if (!entry) throw new StateError('entry_out_of_scope', 'Entry does not belong to this state contest.');
	const [student] = await db.select().from(schema.annualStudents).where(and(eq(schema.annualStudents.id, input.annualStudentId), eq(schema.annualStudents.seasonId, contest.seasonId)));
	if (!student) throw new StateError('student_out_of_scope', 'Student does not belong to this state season.');
	const [roster] = await db.select().from(schema.stateRosterMembers).where(and(eq(schema.stateRosterMembers.contestId, contest.id), eq(schema.stateRosterMembers.annualStudentId, student.id)));
	if (!roster) throw new StateError('student_not_rostered', 'Student must be on the confirmed state roster first.');
	const settings = stateSettings(contest.settingsJson);
	if (entry.ownerSchoolId && entry.ownerSchoolId !== student.schoolId) throw new StateError('school_out_of_scope', 'School-owned state entries may only include students from that school.');
	if (!entry.ownerSchoolId && entry.category === 'topical_team' && !settings.crossSchoolTopicalTeamsAllowed) throw new StateError('policy_blocked', 'Cross-school Topical Teams are disabled for this state contest.');
	const existingEntries = await db.select({ entry: schema.entries }).from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).where(and(eq(schema.entries.contestId, contest.id), eq(schema.entryMembers.annualStudentId, student.id)));
	const existingMembers = await db.select().from(schema.entryMembers).where(eq(schema.entryMembers.entryId, entry.id));
	const competingGrade = input.competingGrade ?? null;
	const errors = validateEntryMembership({ category: entry.category, entryKind: entry.entryKind, actualGrade: student.actualGrade, competingGrade, existingMemberGrades: existingMembers.map((member) => member.competingGrade), existingEntryCategories: existingEntries.map(({ entry: existing }) => existing.category) });
	if (errors.length) throw new StateError(errors[0].code, errors[0].message);
	const now = input.now ?? Date.now();
	await db.batch([
		db.insert(schema.entryMembers).values({ entryId: entry.id, annualStudentId: student.id, competingGrade }),
		db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: contest.id, schoolId: student.schoolId, entityType: 'state_entry_member', entityId: `${entry.id}:${student.id}`, action: 'state_entry_member_added', detailsJson: JSON.stringify({ entryId: entry.id, annualStudentId: student.id, competingGrade }), createdAt: now }),
	] as [any, ...any[]]);
}

export async function removeStateEntryMember(db: Database, input: { contestId: string; entryId: string; annualStudentId: string; actorUserId: string; now?: number }) {
	const contest = await requireStateContest(db, input.contestId, true);
	const [entry] = await db.select().from(schema.entries).where(and(eq(schema.entries.id, input.entryId), eq(schema.entries.contestId, contest.id)));
	if (!entry) throw new StateError('entry_out_of_scope', 'Entry does not belong to this state contest.');
	const now = input.now ?? Date.now();
	await db.batch([
		db.delete(schema.entryMembers).where(and(eq(schema.entryMembers.entryId, input.entryId), eq(schema.entryMembers.annualStudentId, input.annualStudentId))),
		db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: contest.id, entityType: 'state_entry_member', entityId: `${input.entryId}:${input.annualStudentId}`, action: 'state_entry_member_removed', detailsJson: '{}', createdAt: now }),
	] as [any, ...any[]]);
}
