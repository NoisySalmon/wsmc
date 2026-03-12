/**
 * Pure ranking/award computation functions.
 * No DB dependencies — takes data arrays and returns ranked results.
 */

export type TeamRankingEntry = {
	teamId: string;
	schoolName: string;
	division: number;
	teamNumber: number;
	members: { name: string; competingGrade: number }[];
	score: number;
};

export type IndividualRankingEntry = {
	studentId: string;
	name: string;
	schoolName: string;
	division: number;
	competingGrade: number;
	part1: number;
	part2: number;
	total: number;
};

export type KnowdownEntry = {
	place: number;
	studentName: string;
	schoolName: string;
	division: number;
};

export type DistinguishedEntry = {
	competingGrade: number;
	division: number;
	studentName: string;
	schoolName: string;
	total: number;
};

export type RankedEntry<T> = T & { rank: number };

/**
 * Rank entries by score descending, optionally filtered by division.
 * Entries with equal scores get the same rank.
 */
export function rankByScore<T extends { score: number; division: number }>(
	entries: T[],
	division?: number
): RankedEntry<T>[] {
	const filtered = division ? entries.filter((e) => e.division === division) : entries;
	const sorted = [...filtered].sort((a, b) => b.score - a.score);

	let rank = 1;
	return sorted.map((entry, i) => {
		if (i > 0 && entry.score < sorted[i - 1].score) {
			rank = i + 1;
		}
		return { ...entry, rank };
	});
}

/**
 * Rank individual topical entries by total descending, optionally filtered by division and/or grade.
 */
export function rankIndividuals(
	entries: IndividualRankingEntry[],
	opts?: { division?: number; grade?: number }
): RankedEntry<IndividualRankingEntry>[] {
	let filtered = entries;
	if (opts?.division) filtered = filtered.filter((e) => e.division === opts.division);
	if (opts?.grade) filtered = filtered.filter((e) => e.competingGrade === opts.grade);

	const sorted = [...filtered].sort((a, b) => b.total - a.total);

	let rank = 1;
	return sorted.map((entry, i) => {
		if (i > 0 && entry.total < sorted[i - 1].total) {
			rank = i + 1;
		}
		return { ...entry, rank };
	});
}

/**
 * Compute distinguished students: per grade per division, the top-scoring individual
 * whose topical team did NOT place in the top 3 of topical team rankings.
 *
 * @param individuals - all individual topical entries
 * @param topicalTeamTop3StudentIds - set of student IDs who are on a topical team that placed top 3
 */
export function computeDistinguished(
	individuals: IndividualRankingEntry[],
	topicalTeamTop3StudentIds: Set<string>
): DistinguishedEntry[] {
	const results: DistinguishedEntry[] = [];

	for (const division of [1, 2]) {
		for (const grade of [9, 10, 11, 12]) {
			const ranked = rankIndividuals(individuals, { division, grade });
			const eligible = ranked.filter((e) => !topicalTeamTop3StudentIds.has(e.studentId));
			if (eligible.length > 0) {
				const top = eligible[0];
				results.push({
					competingGrade: grade,
					division,
					studentName: top.name,
					schoolName: top.schoolName,
					total: top.total,
				});
			}
		}
	}

	return results;
}
