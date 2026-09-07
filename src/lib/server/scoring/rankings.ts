import { rankByScore, rankIndividuals, type IndividualRankingEntry } from '$lib/rankings';
import type { ScoreCategory } from './service';

export type RegionalResultRow = {
	entryId: string;
	category: ScoreCategory;
	division: number;
	entryNumber: number | null;
	schoolName: string;
	score: number | null;
	part1: number | null;
	part2: number | null;
	placement: number | null;
	studentName: string | null;
	actualGrade: number | null;
};

export type RegionalRankedResult = RegionalResultRow & { rank: number; actualGradeRank?: number };
export type RegionalRankings = Record<'project' | 'team_contest' | 'topical_team' | 'topical_individual' | 'knowdown', RegionalRankedResult[]>;

function rankedCategory(rows: RegionalResultRow[], category: ScoreCategory): RegionalRankedResult[] {
	const byDivision: RegionalRankedResult[] = [];
	for (const division of [1, 2]) {
		const scored = rows.filter((row) => row.category === category && row.division === division && row.score !== null) as (RegionalResultRow & { score: number })[];
		byDivision.push(...rankByScore(scored, division));
	}
	return byDivision;
}

function rankedTopicalIndividuals(rows: RegionalResultRow[]): RegionalRankedResult[] {
	const output: RegionalRankedResult[] = [];
	for (const division of [1, 2]) {
		const source = rows.filter((row) => row.category === 'topical_individual' && row.division === division && row.score !== null && row.part1 !== null && row.part2 !== null && row.studentName !== null && row.actualGrade !== null);
		const individuals: IndividualRankingEntry[] = source.map((row) => ({ studentId: row.entryId, name: row.studentName!, schoolName: row.schoolName, division: row.division, competingGrade: row.actualGrade!, part1: row.part1!, part2: row.part2!, total: row.score! }));
		const overall = rankIndividuals(individuals, { division });
		for (const entry of overall) {
			const gradeRank = rankIndividuals(individuals, { division: entry.division, grade: entry.competingGrade }).find((candidate) => candidate.studentId === entry.studentId)?.rank;
			const resultRow = source.find((candidate) => candidate.entryId === entry.studentId)!;
			output.push({ ...resultRow, rank: entry.rank, actualGradeRank: gradeRank });
		}
	}
	return output;
}

function rankedKnowdown(rows: RegionalResultRow[]): RegionalRankedResult[] {
	const ordered = rows.filter((row) => row.category === 'knowdown' && row.placement !== null).sort((a, b) => a.placement! - b.placement!);
	let rank = 1;
	return ordered.map((row, index) => {
		if (index > 0 && row.placement! > ordered[index - 1].placement!) rank = index + 1;
		return { ...row, rank };
	});
}

/** Build all regional result boards from complete, already-validated result rows. */
export function rankRegionalResults(rows: RegionalResultRow[]): RegionalRankings {
	return {
		project: rankedCategory(rows, 'project'),
		team_contest: rankedCategory(rows, 'team_contest'),
		topical_team: rankedCategory(rows, 'topical_team'),
		topical_individual: rankedTopicalIndividuals(rows),
		knowdown: rankedKnowdown(rows),
	};
}
