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

/**
 * Identifies "Distinguished" students for a consolidated individual list.
 * A student is distinguished if they are the highest scorer in their grade
 * (among those in the given division, if any) AND they are NOT in the top 3 overall.
 */
export function getDistinguishedIndividualIds(
	rankedEntries: RankedEntry<IndividualRankingEntry>[]
): Map<string, string> {
	const distinguishedMap = new Map<string, string>(); // studentId -> label
	const top3Ids = new Set(rankedEntries.filter((e) => e.rank <= 3).map((e) => e.studentId));

	const gradeNames: Record<number, string> = {
		9: 'Freshman',
		10: 'Sophomore',
		11: 'Junior',
		12: 'Senior',
	};

	// Group by grade and find the top student not in top 3
	const grades = [9, 10, 11, 12];
	for (const grade of grades) {
		const gradeEntries = rankedEntries.filter((e) => e.competingGrade === grade && !top3Ids.has(e.studentId));
		if (gradeEntries.length > 0) {
			// They are already sorted by rank (score)
			const top = gradeEntries[0];
			distinguishedMap.set(top.studentId, `Distinguished ${gradeNames[grade]}`);
		}
	}

	return distinguishedMap;
}
