/**
 * Pure ranking computation functions.
 * No DB dependencies — takes data arrays and returns ranked results.
 */

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

export type RankedEntry<T> = T & { rank: number };

/**
 * Rank entries by score descending, optionally filtered by division.
 * Entries with equal scores get the same rank.
 */
export function rankByScore<T extends { score: number; division: number }>(
	entries: T[],
	division?: number
): RankedEntry<T>[] {
	const filtered = division !== undefined && division !== 0 ? entries.filter((e) => Number(e.division) === Number(division)) : entries;
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
	if (opts?.division !== undefined && opts.division !== 0) {
		filtered = filtered.filter((e) => Number(e.division) === Number(opts.division));
	}
	if (opts?.grade !== undefined && opts.grade !== 0) {
		filtered = filtered.filter((e) => Number(e.competingGrade) === Number(opts.grade));
	}

	const sorted = [...filtered].sort((a, b) => b.total - a.total || b.part2 - a.part2 || b.part1 - a.part1);

	let rank = 1;
	return sorted.map((entry, i) => {
		if (i > 0 && entry.total < sorted[i - 1].total) {
			rank = i + 1;
		}
		return { ...entry, rank };
	});
}
