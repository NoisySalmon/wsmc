import type { RegionalRankedResult } from './rankings';

export function toPublicStateResult(category: string, row: RegionalRankedResult) {
	return {
		category,
		division: row.division,
		rank: row.rank,
		actualGrade: row.actualGrade,
		actualGradeRank: row.actualGradeRank ?? null,
		entryNumber: row.entryNumber,
		schoolName: row.schoolName,
		studentName: row.studentName,
		score: row.score,
		part1: row.part1,
		part2: row.part2,
		placement: row.placement,
	};
}
