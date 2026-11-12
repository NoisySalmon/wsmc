import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';

// Scope in SQL rather than binding one ID per qualifier (D1 allows 100 parameters).
async function reasonsForRound(db: Database, roundId: string) {
	const rows = await db.select({ reason: schema.qualificationReasons }).from(schema.qualificationReasons)
		.innerJoin(schema.qualifications, eq(schema.qualifications.id, schema.qualificationReasons.qualificationId))
		.where(eq(schema.qualifications.roundId, roundId));
	return rows.map((row) => row.reason);
}

export async function getQualificationRoundReview(db: Database, seasonId: string, kind: 'regional_placements' | 'state_cutoff' | 'manual_review') {
	const [round] = await db.select().from(schema.qualificationRounds).where(and(eq(schema.qualificationRounds.seasonId, seasonId), eq(schema.qualificationRounds.kind, kind))).orderBy(asc(schema.qualificationRounds.createdAt));
	if (!round) return { round: null, qualifications: [] };
	const rows = await db.select({ qualification: schema.qualifications, score: schema.results.score, entry: schema.entries, schoolName: schema.schools.shortName, studentName: schema.annualStudents.name, actualGrade: schema.annualStudents.actualGrade, regionNumber: schema.regions.number, regionName: schema.regions.name })
		.from(schema.qualifications).innerJoin(schema.entries, eq(schema.entries.id, schema.qualifications.entryId)).leftJoin(schema.results, eq(schema.results.entryId, schema.entries.id)).innerJoin(schema.contests, eq(schema.contests.id, schema.entries.contestId)).leftJoin(schema.regions, eq(schema.regions.id, schema.contests.regionId)).leftJoin(schema.schools, eq(schema.schools.id, schema.entries.ownerSchoolId)).leftJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.qualifications.studentId)).where(eq(schema.qualifications.roundId, round.id));
	const reasons = await reasonsForRound(db, round.id);
	return { round, qualifications: rows.map(({ qualification, entry, score, schoolName, studentName, actualGrade, regionNumber, regionName }) => ({ ...qualification, category: entry.category, score, regionNumber, regionName, actualGrade, entryNumber: entry.entryNumber, division: entry.division, schoolName: schoolName || 'Statewide entry', studentName: studentName || null, reasons: reasons.filter((reason) => reason.qualificationId === qualification.id) })) };
}

export async function getQualificationReview(db: Database, seasonId: string) {
	return getQualificationRoundReview(db, seasonId, 'regional_placements');
}
