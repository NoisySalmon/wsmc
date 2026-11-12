import { and, eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import {
	exportRegistrationCsv, parseRegistrationCsv, type RegistrationCsvCategory,
	type RegistrationCsvPreview, type RegistrationCsvSnapshot, validateRegistrationCsv, RegistrationCsvError,
} from './csv';

const categories: RegistrationCsvCategory[] = ['project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown'];
const teamCategories = new Set<RegistrationCsvCategory>(['project', 'team_contest', 'topical_team']);

export async function loadRegistrationCsvScope(db: Database, contestId: string, schoolId: string) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	const [school] = await db.select().from(schema.schools).where(eq(schema.schools.id, schoolId));
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.contestId, contestId), eq(schema.schoolParticipations.schoolId, schoolId)));
	if (!contest || contest.kind !== 'regional') throw new RegistrationCsvError('not_found', 'Regional contest not found.');
	if (!school || !school.active) throw new RegistrationCsvError('not_found', 'Active school not found.');
	if (!participation) throw new RegistrationCsvError('not_found', 'School participation not found.');
	if (participation.withdrawnAt != null) throw new RegistrationCsvError('withdrawn', 'This school has withdrawn. Restore participation from the contest page before editing.');
	if (contest.lifecycle !== 'registration_open') throw new RegistrationCsvError('locked', 'Registration is locked for this contest.');
	const [season] = await db.select({ status: schema.seasons.status }).from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	if (!season || season.status === 'archived') throw new RegistrationCsvError('locked', 'This season is archived and cannot be edited.');
	return { contest, school, participation };
}

export async function loadRegistrationCsvSnapshot(db: Database, contestId: string, schoolId: string): Promise<RegistrationCsvSnapshot> {
	const { contest } = await loadRegistrationCsvScope(db, contestId, schoolId);
	const students = await db.select().from(schema.annualStudents).where(and(eq(schema.annualStudents.seasonId, contest.seasonId), eq(schema.annualStudents.schoolId, schoolId)));
	const entries = await db.select().from(schema.entries).where(and(eq(schema.entries.contestId, contestId), eq(schema.entries.ownerSchoolId, schoolId)));
	return {
		students: students.map(({ id, name, actualGrade }) => ({ id, name, actualGrade })),
		entries: entries.map(({ id, category, entryNumber, entryKind, ownerSchoolId }) => ({ id, category: category as RegistrationCsvCategory, entryNumber, entryKind, ownerSchoolId })),
	};
}

export async function exportRegistrationCsvFromDb(db: Database, contestId: string, schoolId: string): Promise<string> {
	await loadRegistrationCsvScope(db, contestId, schoolId);
	return exportRegistrationCsv();
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
	const preview = validateRegistrationCsv(parseRegistrationCsv(input.text), snapshot);
	const rows = preview.rows;
	const now = input.now ?? Date.now();

	const operations: any[] = [];
	const entriesByKey = new Map(snapshot.entries.filter(entry => teamCategories.has(entry.category) && entry.entryNumber !== null).map(entry => [entryKey(entry.category, entry.entryNumber), entry]));
	const resolvedRows = rows.map(row => {
		const studentId = crypto.randomUUID();
		operations.push(db.insert(schema.annualStudents).values({ id: studentId, seasonId: scope.contest.seasonId, schoolId: input.schoolId, name: row.studentName, actualGrade: row.actualGrade, createdAt: now, updatedAt: now }));
		operations.push(db.insert(schema.contestRosterMembers).values({ contestId: input.contestId, participationId: scope.participation.id, annualStudentId: studentId, createdAt: now }));
		return { studentId, row };
	});
	for (const { studentId, row } of resolvedRows) for (const category of categories) {
		const ref = row.entries[category];
		const hasReference = ref.selected;
		if (!hasReference) continue;
		let entry: RegistrationCsvSnapshot['entries'][number] | undefined;
		if (!entry && ref.entryNumber !== null) entry = entriesByKey.get(entryKey(category, ref.entryNumber));
		if (!entry) {
			entry = { id: crypto.randomUUID(), category, entryNumber: ref.entryNumber, entryKind: teamCategories.has(category) ? 'team' : 'individual', ownerSchoolId: input.schoolId };
			operations.push(db.insert(schema.entries).values({ id: entry.id, contestId: input.contestId, ownerSchoolId: input.schoolId, category, entryKind: entry.entryKind, entryNumber: entry.entryNumber, division: scope.participation.division }));
			if (teamCategories.has(category) && entry.entryNumber !== null) entriesByKey.set(entryKey(category, entry.entryNumber), entry);
		}
		operations.push(db.insert(schema.entryMembers).values({ entryId: entry.id, annualStudentId: studentId, competingGrade: teamCategories.has(category) ? ref.competingGrade : null }));
	}
	operations.push(db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, schoolId: input.schoolId, entityType: 'registration', entityId: input.schoolId, action: 'registration_csv_imported', detailsJson: JSON.stringify({ rows: rows.length, newStudents: preview.newStudents, categorySelections: preview.categorySelections, duplicateRows: preview.duplicateRows, skippedRows: preview.skippedRows }), createdAt: now }));
	await db.batch(operations as [any, ...any[]]);
	return preview;
}
