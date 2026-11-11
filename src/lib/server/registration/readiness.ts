import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { validateEntryMembership } from '$lib/server/db/repositories';

/** Recheck persisted registration, including incomplete legacy/imported entries. */
export async function getRegistrationReadiness(db: Database, contestId: string) {
	const [participations, roster, entries, members] = await Promise.all([
		db.select().from(schema.schoolParticipations).where(eq(schema.schoolParticipations.contestId, contestId)),
		db.select({ student: schema.annualStudents, participationId: schema.contestRosterMembers.participationId }).from(schema.contestRosterMembers).innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.contestRosterMembers.annualStudentId)).where(eq(schema.contestRosterMembers.contestId, contestId)),
		db.select().from(schema.entries).where(eq(schema.entries.contestId, contestId)),
		db.select({ member: schema.entryMembers, student: schema.annualStudents }).from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.entryMembers.annualStudentId)).where(eq(schema.entries.contestId, contestId)),
	]);
	return participations.map((participation) => {
		const schoolEntries = entries.filter(e => e.ownerSchoolId === participation.schoolId);
		const schoolRoster = roster.filter(r => r.participationId === participation.id);
		const issues = new Set<string>();
		for (const entry of schoolEntries) {
			const entryMembers = members.filter(m => m.member.entryId === entry.id);
			if (!entryMembers.length) issues.add('An entry has no participants.');
			if (entry.entryKind === 'individual' && entryMembers.length !== 1) issues.add('Individual entries need exactly one participant.');
			if (entry.division !== participation.division) issues.add('An entry has the wrong school division.');
			for (const { member, student } of entryMembers) {
				if (!schoolRoster.some(r => r.student.id === student.id)) issues.add('An entry participant is not on the school roster.');
				const membershipIssues = validateEntryMembership({
					category: entry.category, entryKind: entry.entryKind,
					actualGrade: student.actualGrade, competingGrade: member.competingGrade,
					existingMemberGrades: entryMembers.filter(m => m.member.annualStudentId !== student.id).map(m => m.member.competingGrade),
					existingEntryCategories: members.filter(m => m.student.id === student.id && m.member.entryId !== entry.id).map(m => entries.find(e => e.id === m.member.entryId)!.category),
				});
				for (const issue of membershipIssues) issues.add(issue.message);
			}
		}
		if (schoolEntries.filter(e => e.category === 'knowdown').length > 3) issues.add('Choose at most 3 Knowdown competitors.');
		for (const { student } of schoolRoster) if (!members.some(m => m.student.id === student.id)) issues.add(`${student.name} has no event assignments.`);
		return { schoolId: participation.schoolId, issues: [...issues], status: participation.withdrawnAt != null ? 'Withdrawn' : issues.size ? 'Needs attention' : !schoolRoster.length && !schoolEntries.length ? 'No registration' : 'Valid' };
	});
}
