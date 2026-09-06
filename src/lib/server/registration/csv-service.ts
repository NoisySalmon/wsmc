import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import {
	exportRegistrationCsv, parseRegistrationCsv, registrationCsvFormat, type RegistrationCsvCategory,
	type RegistrationCsvPreview, type RegistrationCsvSnapshot, validateRegistrationCsv, RegistrationCsvError,
} from './csv';

const categories: RegistrationCsvCategory[] = ['project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown'];
const teamCategories = new Set<RegistrationCsvCategory>(['project', 'team_contest', 'topical_team']);

export class RegistrationCsvValidationError extends RegistrationCsvError {
	constructor(public readonly preview: RegistrationCsvPreview) {
		super('validation_failed', `The CSV has ${preview.errors.length} validation error${preview.errors.length === 1 ? '' : 's'}.`);
	}
}

export async function loadRegistrationCsvScope(db: Database, contestId: string, schoolId: string) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	const [school] = await db.select().from(schema.schools).where(eq(schema.schools.id, schoolId));
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.contestId, contestId), eq(schema.schoolParticipations.schoolId, schoolId)));
	if (!contest || contest.kind !== 'regional') throw new RegistrationCsvError('not_found', 'Regional contest not found.');
	if (!school || !school.active) throw new RegistrationCsvError('not_found', 'Active school not found.');
	if (!participation) throw new RegistrationCsvError('not_found', 'School participation not found.');
	if (contest.lifecycle !== 'registration_open') throw new RegistrationCsvError('locked', 'Registration is locked for this contest.');
	const [season] = await db.select({ status: schema.seasons.status }).from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	if (!season || season.status === 'archived') throw new RegistrationCsvError('locked', 'This season is archived and cannot be edited.');
	return { contest, school, participation };
}

export async function loadRegistrationCsvSnapshot(db: Database, contestId: string, schoolId: string): Promise<RegistrationCsvSnapshot> {
	const { contest } = await loadRegistrationCsvScope(db, contestId, schoolId);
	const students = await db.select().from(schema.annualStudents).where(and(eq(schema.annualStudents.seasonId, contest.seasonId), eq(schema.annualStudents.schoolId, schoolId)));
	const roster = await db.select({ annualStudentId: schema.contestRosterMembers.annualStudentId }).from(schema.contestRosterMembers).where(eq(schema.contestRosterMembers.contestId, contestId));
	const entries = await db.select().from(schema.entries).where(and(eq(schema.entries.contestId, contestId), eq(schema.entries.ownerSchoolId, schoolId)));
	const members = entries.length ? await db.select().from(schema.entryMembers).where(inArray(schema.entryMembers.entryId, entries.map((entry) => entry.id))) : [];
	return {
		students: students.map(({ id, name, actualGrade }) => ({ id, name, actualGrade })),
		rosterIds: roster.map(({ annualStudentId }) => annualStudentId),
		entries: entries.map(({ id, category, entryNumber, entryKind, ownerSchoolId }) => ({ id, category: category as RegistrationCsvCategory, entryNumber, entryKind, ownerSchoolId })),
		members: members.map(({ entryId, annualStudentId, competingGrade }) => ({ entryId, annualStudentId, competingGrade })),
	};
}

export async function exportRegistrationCsvFromDb(db: Database, contestId: string, schoolId: string): Promise<string> {
	return exportRegistrationCsv(await loadRegistrationCsvSnapshot(db, contestId, schoolId));
}

export async function previewRegistrationCsv(db: Database, contestId: string, schoolId: string, text: string): Promise<RegistrationCsvPreview> {
	const rows = parseRegistrationCsv(text);
	return validateRegistrationCsv(rows, await loadRegistrationCsvSnapshot(db, contestId, schoolId));
}

function entryKey(category: RegistrationCsvCategory, entryNumber: number | null): string {
	return `${category}:${entryNumber ?? ''}`;
}

export async function importRegistrationCsv(db: Database, input: { contestId: string; schoolId: string; actorUserId: string; text: string; now?: number }): Promise<RegistrationCsvPreview> {
	const scope = await loadRegistrationCsvScope(db, input.contestId, input.schoolId);
	const snapshot = await loadRegistrationCsvSnapshot(db, input.contestId, input.schoolId);
	const rows = parseRegistrationCsv(input.text);
	const preview = validateRegistrationCsv(rows, snapshot);
	if (preview.errors.length > 0) throw new RegistrationCsvValidationError(preview);
	const now = input.now ?? Date.now();

	const operations: any[] = [];
	const studentsById = new Map(snapshot.students.map((student) => [student.id, student]));
	const entriesById = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
	const entriesByKey = new Map(snapshot.entries.filter((entry) => entry.entryNumber !== null).map((entry) => [entryKey(entry.category, entry.entryNumber), entry]));
	const importedStudentIds: string[] = [];
	const resolvedRows: { studentId: string; row: (typeof rows)[number] }[] = [];

	for (const row of rows) {
		let studentId = row.studentId;
		if (!studentId) {
			studentId = crypto.randomUUID();
			operations.push(db.insert(schema.annualStudents).values({ id: studentId, seasonId: scope.contest.seasonId, schoolId: input.schoolId, name: row.studentName, actualGrade: row.actualGrade, createdAt: now, updatedAt: now }));
		} else {
			const existing = studentsById.get(studentId)!;
			if (existing.name !== row.studentName || existing.actualGrade !== row.actualGrade) operations.push(db.update(schema.annualStudents).set({ name: row.studentName, actualGrade: row.actualGrade, updatedAt: now }).where(and(eq(schema.annualStudents.id, studentId), eq(schema.annualStudents.seasonId, scope.contest.seasonId), eq(schema.annualStudents.schoolId, input.schoolId))));
		}
		studentsById.set(studentId, { id: studentId, name: row.studentName, actualGrade: row.actualGrade });
		importedStudentIds.push(studentId);
		resolvedRows.push({ studentId, row });
	}

	const entryIds = snapshot.entries.map((entry) => entry.id);
	if (entryIds.length && importedStudentIds.length) operations.push(db.delete(schema.entryMembers).where(and(inArray(schema.entryMembers.entryId, entryIds), inArray(schema.entryMembers.annualStudentId, importedStudentIds))));
	const rosterIds = new Set(snapshot.rosterIds);
	for (const { studentId, row } of resolvedRows) {
		if (row.rostered) {
			if (!rosterIds.has(studentId)) operations.push(db.insert(schema.contestRosterMembers).values({ contestId: input.contestId, participationId: scope.participation.id, annualStudentId: studentId, createdAt: now }));
		} else {
			operations.push(db.delete(schema.contestRosterMembers).where(and(eq(schema.contestRosterMembers.contestId, input.contestId), eq(schema.contestRosterMembers.annualStudentId, studentId))));
		}
	}

	for (const { studentId, row } of resolvedRows) for (const category of categories) {
		const ref = row.entries[category];
		const hasReference = Boolean(ref.entryId || ref.entryNumber !== null);
		if (!hasReference) continue;
		let entry = ref.entryId ? entriesById.get(ref.entryId) : undefined;
		if (!entry && ref.entryNumber !== null) entry = entriesByKey.get(entryKey(category, ref.entryNumber));
		if (!entry) {
			entry = { id: crypto.randomUUID(), category, entryNumber: ref.entryNumber, entryKind: teamCategories.has(category) ? 'team' : 'individual', ownerSchoolId: input.schoolId };
			operations.push(db.insert(schema.entries).values({ id: entry.id, contestId: input.contestId, ownerSchoolId: input.schoolId, category, entryKind: entry.entryKind, entryNumber: entry.entryNumber, division: scope.participation.division }));
			entriesById.set(entry.id, entry);
			if (entry.entryNumber !== null) entriesByKey.set(entryKey(category, entry.entryNumber), entry);
		}
		operations.push(db.insert(schema.entryMembers).values({ entryId: entry.id, annualStudentId: studentId, competingGrade: teamCategories.has(category) ? ref.competingGrade : null }));
	}
	operations.push(db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, schoolId: input.schoolId, entityType: 'registration', entityId: input.schoolId, action: 'registration_csv_imported', detailsJson: JSON.stringify({ format: registrationCsvFormat, rows: rows.length, newStudents: preview.newStudents, categorySelections: preview.categorySelections }), createdAt: now }));
	await db.batch(operations as [any, ...any[]]);
	return preview;
}
