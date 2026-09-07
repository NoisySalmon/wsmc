import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from './index';
import { schema } from './index';
import { validatePlayUp } from '$lib/validation';

export class PersistenceRuleError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'PersistenceRuleError';
	}
}

type EntryCategory = 'project' | 'team_contest' | 'topical_team' | 'topical_individual' | 'knowdown';

const teamCategories = new Set<EntryCategory>(['project', 'team_contest', 'topical_team']);

export type EntryMembershipValidationInput = {
	category: EntryCategory;
	entryKind: 'team' | 'individual';
	actualGrade: number;
	competingGrade: number | null;
	existingMemberGrades: (number | null)[];
	existingEntryCategories: EntryCategory[];
};

/** Pure validation shared by the persistence boundary and its tests. */
export function validateEntryMembership(input: EntryMembershipValidationInput): PersistenceRuleError[] {
	const errors: PersistenceRuleError[] = [];
	const expectedKind = teamCategories.has(input.category) ? 'team' : 'individual';
	if (input.entryKind !== expectedKind) {
		errors.push(new PersistenceRuleError('entry_kind_mismatch', `${input.category} entries must be ${expectedKind} entries.`));
		return errors;
	}

	if (input.entryKind === 'team') {
		if (input.competingGrade === null) {
			errors.push(new PersistenceRuleError('competing_grade_required', 'Team members must declare a competing grade for this entry.'));
		} else {
			const playUpError = validatePlayUp(input.actualGrade, input.competingGrade);
			if (playUpError) errors.push(new PersistenceRuleError('playing_down', playUpError));
			if (input.existingMemberGrades.length >= 3) {
				errors.push(new PersistenceRuleError('team_too_large', 'A team may have at most 3 members.'));
			}
			if (input.existingMemberGrades.some((grade) => grade === input.competingGrade)) {
				errors.push(new PersistenceRuleError('duplicate_competing_grade', 'Team members must have distinct competing grades.'));
			}
		}
	} else if (input.competingGrade !== null) {
		errors.push(new PersistenceRuleError('individual_grade_forbidden', 'Individual entries do not store a competing grade.'));
	}

	if (input.existingEntryCategories.some((category) => category === input.category)) {
		errors.push(new PersistenceRuleError('duplicate_category_entry', 'A student may be in at most one entry in a category.'));
	}
	if (input.category === 'topical_team' && input.existingEntryCategories.includes('topical_individual')) {
		errors.push(new PersistenceRuleError('topical_exclusivity', 'A student cannot compete in both Topical Team and Topical Individual.'));
	}
	if (input.category === 'topical_individual' && input.existingEntryCategories.includes('topical_team')) {
		errors.push(new PersistenceRuleError('topical_exclusivity', 'A student cannot compete in both Topical Team and Topical Individual.'));
	}
	return errors;
}

export function assertContestScope<T extends { contestId: string }>(row: T | undefined, contestId: string): T {
	if (!row || row.contestId !== contestId) {
		throw new PersistenceRuleError('entry_out_of_scope', 'Record does not belong to this contest.');
	}
	return row;
}

function newId(): string {
	return crypto.randomUUID();
}

async function requireContest(db: Database, contestId: string) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	if (!contest) throw new PersistenceRuleError('contest_not_found', 'Contest not found.');
	return contest;
}

async function requireEntryInContest(db: Database, contestId: string, entryId: string) {
	const [entry] = await db.select().from(schema.entries).where(eq(schema.entries.id, entryId));
	return assertContestScope(entry, contestId);
}

async function requireStudentForSeason(db: Database, seasonId: string, annualStudentId: string) {
	const [student] = await db.select().from(schema.annualStudents).where(
		and(eq(schema.annualStudents.id, annualStudentId), eq(schema.annualStudents.seasonId, seasonId)),
	);
	if (!student) throw new PersistenceRuleError('student_out_of_scope', 'Student does not belong to this contest season.');
	return student;
}

async function requireRosteredStudent(db: Database, contestId: string, annualStudentId: string) {
	const [roster] = await db.select().from(schema.contestRosterMembers).where(
		and(eq(schema.contestRosterMembers.contestId, contestId), eq(schema.contestRosterMembers.annualStudentId, annualStudentId)),
	);
	if (!roster) throw new PersistenceRuleError('student_not_rostered', 'Student must be on the contest roster before entering a category.');
	return roster;
}

function assertCategoryKind(category: EntryCategory, entryKind: 'team' | 'individual') {
	const expectedKind = teamCategories.has(category) ? 'team' : category === 'knowdown' || category === 'topical_individual' ? 'individual' : null;
	if (expectedKind !== entryKind) {
		throw new PersistenceRuleError('entry_kind_mismatch', `${category} entries must be ${expectedKind} entries.`);
	}
}

/** Create an entry only after proving its contest and owner-school scope. */
export async function createEntry(
	db: Database,
	input: {
		contestId: string;
		ownerSchoolId?: string | null;
		category: EntryCategory;
		entryKind: 'team' | 'individual';
		entryNumber?: number | null;
		division: number;
	},
) {
		const contest = await requireContest(db, input.contestId);
		assertCategoryKind(input.category, input.entryKind);
		if (input.ownerSchoolId) {
			const [participation] = await db.select().from(schema.schoolParticipations).where(
				and(eq(schema.schoolParticipations.contestId, input.contestId), eq(schema.schoolParticipations.schoolId, input.ownerSchoolId)),
			);
			if (!participation) throw new PersistenceRuleError('school_out_of_scope', 'Owner school is not participating in this contest.');
			if (participation.division !== input.division) throw new PersistenceRuleError('division_mismatch', 'Entry division must match the school participation.');
		}
		return db.insert(schema.entries).values({ id: newId(), contestId: contest.id, ownerSchoolId: input.ownerSchoolId ?? null, category: input.category, entryKind: input.entryKind, entryNumber: input.entryNumber ?? null, division: input.division }).returning();
}

/** Add a roster member while enforcing contest scope and category rules. */
export async function addEntryMember(
	db: Database,
	input: { contestId: string; entryId: string; annualStudentId: string; competingGrade?: number | null },
) {
	const entry = await requireEntryInContest(db, input.contestId, input.entryId);
	const contest = await requireContest(db, input.contestId);
	const student = await requireStudentForSeason(db, contest.seasonId, input.annualStudentId);
	const roster = await requireRosteredStudent(db, input.contestId, input.annualStudentId);
	const [participation] = await db.select().from(schema.schoolParticipations).where(
		and(eq(schema.schoolParticipations.id, roster.participationId), eq(schema.schoolParticipations.contestId, input.contestId)),
	);
	if (!participation) throw new PersistenceRuleError('participation_not_found', 'Roster participation not found.');
	if (entry.ownerSchoolId && participation.schoolId !== entry.ownerSchoolId && contest.kind === 'regional') {
		throw new PersistenceRuleError('school_out_of_scope', 'Regional entry members must belong to the entry owner school.');
	}

	const competingGrade = input.competingGrade ?? null;
	const existingEntries = await db.select({ entry: schema.entries, member: schema.entryMembers }).from(schema.entryMembers)
		.innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId))
		.where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entryMembers.annualStudentId, input.annualStudentId)));
	const existingMembers = await db.select().from(schema.entryMembers).where(eq(schema.entryMembers.entryId, entry.id));
	const errors = validateEntryMembership({
		category: entry.category,
		entryKind: entry.entryKind,
		actualGrade: student.actualGrade,
		competingGrade,
		existingMemberGrades: existingMembers.map((member) => member.competingGrade),
		existingEntryCategories: existingEntries.map(({ entry: existing }) => existing.category),
	});
	if (errors.length > 0) throw errors[0];

	return db.insert(schema.entryMembers).values({ entryId: entry.id, annualStudentId: student.id, competingGrade }).returning();
}

/** Save a score through the contest-scoped entry boundary. */
export async function saveResult(
	db: Database,
	input: { contestId: string; entryId: string; expectedVersion?: number; score?: number | null; part1?: number | null; part2?: number | null; placement?: number | null; lastEditedBy?: string | null },
) {
	await requireEntryInContest(db, input.contestId, input.entryId);
	const [current] = await db.select().from(schema.results).where(eq(schema.results.entryId, input.entryId));
	if (current && input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
		throw new PersistenceRuleError('stale_result', 'This result changed after it was loaded. Refresh before saving.');
	}
	const version = current ? current.version + 1 : 1;
	if (current) {
		const updateWhere = input.expectedVersion === undefined
			? eq(schema.results.entryId, input.entryId)
			: and(eq(schema.results.entryId, input.entryId), eq(schema.results.version, input.expectedVersion));
		const updated = await db.update(schema.results).set({ score: input.score ?? null, part1: input.part1 ?? null, part2: input.part2 ?? null, placement: input.placement ?? null, version, lastEditedBy: input.lastEditedBy ?? null }).where(updateWhere).returning();
		if (updated.length === 0 && input.expectedVersion !== undefined) {
			throw new PersistenceRuleError('stale_result', 'This result changed after it was loaded. Refresh before saving.');
		}
		return updated;
	}
	if (input.expectedVersion !== undefined && input.expectedVersion !== 0) {
		throw new PersistenceRuleError('stale_result', 'This result changed after it was loaded. Refresh before saving.');
	}
	return db.insert(schema.results).values({ entryId: input.entryId, score: input.score ?? null, part1: input.part1 ?? null, part2: input.part2 ?? null, placement: input.placement ?? null, version, lastEditedBy: input.lastEditedBy ?? null }).returning();
}

/** Archive a school in the directory without deleting historical references. */
export async function archiveSchool(db: Database, schoolId: string) {
	const [school] = await db.select().from(schema.schools).where(eq(schema.schools.id, schoolId));
	if (!school) throw new PersistenceRuleError('school_not_found', 'School not found.');
	return db.update(schema.schools).set({ active: false }).where(eq(schema.schools.id, schoolId)).returning();
}
