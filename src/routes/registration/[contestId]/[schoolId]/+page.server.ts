import { and, eq, inArray } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { canEditRoster, canFinalizeContest } from '$lib/server/auth/capabilities';
import { getDb, schema } from '$lib/server/db';
import { importRegistrationCsv, previewRegistrationCsv, RegistrationCsvValidationError } from '$lib/server/registration/csv-service';
import { addCategoryMember, addRosterStudent, createAnnualStudent, createCategoryEntry, deleteAnnualStudent, deleteCategoryEntry, RegistrationError, removeCategoryMember, removeRosterStudent, reopenRoster, updateAnnualStudent } from '$lib/server/registration/service';
import type { Actions, PageServerLoad } from './$types';

async function scope(db: ReturnType<typeof getDb>, contestId: string, schoolId: string) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	const [participation] = await db.select().from(schema.schoolParticipations).where(and(eq(schema.schoolParticipations.contestId, contestId), eq(schema.schoolParticipations.schoolId, schoolId)));
	const [school] = await db.select().from(schema.schools).where(eq(schema.schools.id, schoolId));
	if (!contest || contest.kind !== 'regional') throw error(404, 'Regional contest not found.');
	if (!participation || !school) throw error(404, 'School participation not found.');
	return { contest, participation, school };
}

function text(data: FormData, name: string): string {
	const value = data.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function formError(cause: unknown) {
	return fail(400, { error: cause instanceof RegistrationError ? cause.message : 'Registration change could not be saved.' });
}

function requireEditable(contest: { lifecycle: string }): void {
	if (contest.lifecycle !== 'registration_open') throw error(409, 'Registration is locked for this contest.');
}

async function csvText(request: Request): Promise<string> {
	const data = await request.formData();
	const file = data.get('file');
	if (!(file instanceof File) || file.size === 0) throw error(400, 'Choose a CSV file to upload.');
	if (file.size > 1_000_000) throw error(400, 'CSV files must be smaller than 1 MB.');
	return file.text();
}

function csvFormError(cause: unknown) {
	if (cause instanceof RegistrationCsvValidationError) return fail(400, { error: cause.message, csvErrors: cause.preview.errors.slice(0, 20), csvSummary: cause.preview });
	return fail(400, { error: cause instanceof Error ? cause.message : 'CSV registration change could not be saved.' });
}

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const { contest, participation, school } = await scope(db, params.contestId, params.schoolId);
	if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot view this school registration.');
	const [students, rosterRows, entries] = await Promise.all([
		db.select().from(schema.annualStudents).where(and(eq(schema.annualStudents.seasonId, contest.seasonId), eq(schema.annualStudents.schoolId, school.id))),
		db.select().from(schema.contestRosterMembers).where(eq(schema.contestRosterMembers.contestId, contest.id)),
		db.select().from(schema.entries).where(and(eq(schema.entries.contestId, contest.id), eq(schema.entries.ownerSchoolId, school.id))),
	]);
	const entryIds = entries.map((entry) => entry.id);
	const members = entryIds.length ? await db.select().from(schema.entryMembers).where(inArray(schema.entryMembers.entryId, entryIds)) : [];
	const rosterIds = new Set(rosterRows.map((row) => row.annualStudentId));
	const readOnly = contest.lifecycle !== 'registration_open';
	return {
		contest, school, participation, students, rosterIds: [...rosterIds], entries, members,
		readOnly, canReopen: canFinalizeContest(locals.principal, contest.id, contest.seasonId),
		readiness: { annualStudentCount: students.length, rosterCount: rosterRows.length, entryCount: entries.length, categories: new Set(entries.map((entry) => entry.category)).size },
	};
};

export const actions: Actions = {
	addStudent: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB);
		const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		requireEditable(contest);
		const data = await request.formData();
		try { await createAnnualStudent(db, { seasonId: contest.seasonId, schoolId: school.id, name: text(data, 'name'), actualGrade: Number(text(data, 'actualGrade')) }); return { success: 'Annual student added.' }; } catch (cause) { return formError(cause); }
	},
	updateStudent: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		requireEditable(contest);
		try { await updateAnnualStudent(db, { seasonId: contest.seasonId, schoolId: school.id, studentId: text(data, 'studentId'), name: text(data, 'name'), actualGrade: Number(text(data, 'actualGrade')) }); return { success: 'Annual student updated.' }; } catch (cause) { return formError(cause); }
	},
	deleteStudent: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.');
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		requireEditable(contest);
		try { await deleteAnnualStudent(db, { seasonId: contest.seasonId, schoolId: school.id, studentId: text(data, 'studentId') }); return { success: 'Annual student deleted.' }; } catch (cause) { return formError(cause); }
	},
	addRoster: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		try { await addRosterStudent(db, { contestId: contest.id, schoolId: school.id, studentId: text(data, 'studentId') }); return { success: 'Student added to contest roster.' }; } catch (cause) { return formError(cause); }
	},
	removeRoster: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		try { await removeRosterStudent(db, { contestId: contest.id, schoolId: school.id, studentId: text(data, 'studentId') }); return { success: 'Student removed from contest roster.' }; } catch (cause) { return formError(cause); }
	},
	createEntry: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		const category = text(data, 'category'); if (!['project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown'].includes(category)) return fail(400, { error: 'Choose a valid category.' });
		try { await createCategoryEntry(db, { contestId: contest.id, schoolId: school.id, category: category as never, entryNumber: text(data, 'entryNumber') ? Number(text(data, 'entryNumber')) : null }); return { success: 'Category entry created.' }; } catch (cause) { return formError(cause); }
	},
	deleteEntry: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		try { await deleteCategoryEntry(db, { contestId: contest.id, schoolId: school.id, entryId: text(data, 'entryId') }); return { success: 'Entry deleted.' }; } catch (cause) { return formError(cause); }
	},
	addMember: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		try { await addCategoryMember(db, { contestId: contest.id, schoolId: school.id, entryId: text(data, 'entryId'), studentId: text(data, 'studentId'), competingGrade: text(data, 'competingGrade') ? Number(text(data, 'competingGrade')) : null }); return { success: 'Student added to entry.' }; } catch (cause) { return formError(cause); }
	},
	removeMember: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		try { await removeCategoryMember(db, { contestId: contest.id, schoolId: school.id, entryId: text(data, 'entryId'), studentId: text(data, 'studentId') }); return { success: 'Student removed from entry.' }; } catch (cause) { return formError(cause); }
	},
	previewCsv: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB); const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		try { requireEditable(contest); const preview = await previewRegistrationCsv(db, contest.id, school.id, await csvText(request)); return { csvSummary: preview, csvErrors: preview.errors.slice(0, 20), success: 'Preview generated. No changes have been saved.' }; } catch (cause) { return csvFormError(cause); }
	},
	importCsv: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const db = getDb(platform.env.DB); const { contest, school } = await scope(db, params.contestId, params.schoolId);
		if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot edit this registration.');
		try { requireEditable(contest); const preview = await importRegistrationCsv(db, { contestId: contest.id, schoolId: school.id, actorUserId: locals.principal.id, text: await csvText(request) }); return { csvSummary: preview, success: `Imported ${preview.rows.length} student rows atomically.` }; } catch (cause) { return csvFormError(cause); }
	},
	reopen: async ({ locals, platform, params, request }) => {
		if (!locals.principal) throw error(401, 'Sign in required.'); if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData(); const db = getDb(platform.env.DB); const { contest } = await scope(db, params.contestId, params.schoolId);
		if (!canFinalizeContest(locals.principal, contest.id, contest.seasonId)) throw error(403, 'Only a contest coordinator can reopen this roster.');
		try { await reopenRoster(db, { contestId: contest.id, actorUserId: locals.principal.id, reason: text(data, 'reason') }); return { success: 'Roster reopened for corrections.' }; } catch (cause) { return formError(cause); }
	},
};
