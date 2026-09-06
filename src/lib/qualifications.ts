/**
 * Pure qualification rules for the regional-to-state workflow.
 * These functions deliberately operate on plain data so they can be used by
 * application services and tested without D1.
 */

export type QualificationCategory =
	| 'project'
	| 'team_contest'
	| 'topical_team'
	| 'topical_individual'
	| 'knowdown';

export type QualificationEntry = {
	entryId: string;
	category: QualificationCategory;
	division?: number;
	score?: number | null;
	place?: number | null;
	actualGrade?: number;
	studentIds: string[];
};

export type QualificationReasonKind =
	| 'regional_placement'
	| 'state_cutoff'
	| 'manual_include'
	| 'knowdown_alternate';

export type QualificationReason = {
	entryId: string;
	category: QualificationCategory;
	studentIds: string[];
	kind: QualificationReasonKind;
	rank?: number;
	scope?: 'overall' | 'actual_grade';
	actualGrade?: number;
	threshold?: number;
};

const cutoffCategories = new Set<QualificationCategory>([
	'team_contest',
	'topical_team',
	'topical_individual',
]);

function competitionRanks(entries: QualificationEntry[]): Map<string, number> {
	const ranked = [...entries]
		.filter((entry): entry is QualificationEntry & { score: number } => entry.score !== null && entry.score !== undefined)
		.sort((a, b) => b.score - a.score);

	const ranks = new Map<string, number>();
	for (const [index, entry] of ranked.entries()) {
		const previous = ranked[index - 1];
		const rank = previous && previous.score === entry.score ? ranks.get(previous.entryId)! : index + 1;
		ranks.set(entry.entryId, rank);
	}
	return ranks;
}

function placementReason(
	entry: QualificationEntry,
	rank: number,
	options: Pick<QualificationReason, 'scope' | 'actualGrade'> = {},
): QualificationReason {
	return {
		entryId: entry.entryId,
		category: entry.category,
		studentIds: entry.studentIds,
		kind: 'regional_placement',
		rank,
		...options,
	};
}

/**
 * Compute regional placement reasons. Competition rank is used, so every
 * entry tied at rank 3 is included. Knowdown is one cross-division bracket.
 */
export function computeRegionalPlacementReasons(entries: QualificationEntry[]): QualificationReason[] {
	const reasons: QualificationReason[] = [];
	const scoredCategories = new Set<QualificationCategory>([
		'project',
		'team_contest',
		'topical_team',
	]);

	for (const category of scoredCategories) {
		const divisions = [...new Set(entries.filter((entry) => entry.category === category).map((entry) => entry.division))];
		for (const division of divisions) {
			const group = entries.filter((entry) => entry.category === category && entry.division === division);
			const ranks = competitionRanks(group);
			for (const entry of group) {
				const rank = ranks.get(entry.entryId);
				if (rank !== undefined && rank <= 3) reasons.push(placementReason(entry, rank));
			}
		}
	}

	const topicalIndividuals = entries.filter((entry) => entry.category === 'topical_individual');
	for (const division of [...new Set(topicalIndividuals.map((entry) => entry.division))]) {
		const divisionEntries = topicalIndividuals.filter((entry) => entry.division === division);
		const overallRanks = competitionRanks(divisionEntries);
		for (const entry of divisionEntries) {
			const rank = overallRanks.get(entry.entryId);
			if (rank !== undefined && rank <= 3) reasons.push(placementReason(entry, rank, { scope: 'overall' }));
		}

		for (const actualGrade of [...new Set(divisionEntries.map((entry) => entry.actualGrade))]) {
			const gradeEntries = divisionEntries.filter((entry) => entry.actualGrade === actualGrade);
			const gradeRanks = competitionRanks(gradeEntries);
			for (const entry of gradeEntries) {
				const rank = gradeRanks.get(entry.entryId);
				if (rank !== undefined && rank <= 3) {
					reasons.push(placementReason(entry, rank, { scope: 'actual_grade', actualGrade }));
				}
			}
		}
	}

	for (const entry of entries.filter((candidate) => candidate.category === 'knowdown')) {
		if (entry.place !== null && entry.place !== undefined && entry.place <= 3) {
			reasons.push({
				entryId: entry.entryId,
				category: entry.category,
				studentIds: entry.studentIds,
				kind: 'regional_placement',
				rank: entry.place,
			});
		} else if (entry.place === 4) {
			reasons.push({
				entryId: entry.entryId,
				category: entry.category,
				studentIds: entry.studentIds,
				kind: 'knowdown_alternate',
				rank: 4,
			});
		}
	}

	return mergeQualificationReasons(reasons);
}

/** Compute proposed statewide additions for category-specific score cutoffs. */
export function computeStateCutoffReasons(
	entries: QualificationEntry[],
	thresholds: Partial<Record<'team_contest' | 'topical_team' | 'topical_individual', number>>,
): QualificationReason[] {
	const reasons: QualificationReason[] = [];
	for (const entry of entries) {
		const threshold = thresholds[entry.category as keyof typeof thresholds];
		if (!cutoffCategories.has(entry.category) || threshold === undefined || entry.score === null || entry.score === undefined) continue;
		if (entry.score >= threshold) {
			reasons.push({
				entryId: entry.entryId,
				category: entry.category,
				studentIds: entry.studentIds,
				kind: 'state_cutoff',
				threshold,
			});
		}
	}
	return mergeQualificationReasons(reasons);
}

/** Remove duplicate explanations while preserving distinct qualification paths. */
export function mergeQualificationReasons(...reasonSets: QualificationReason[][]): QualificationReason[] {
	const seen = new Set<string>();
	const merged: QualificationReason[] = [];
	for (const reasons of reasonSets) {
		for (const reason of reasons) {
			const key = JSON.stringify([
				reason.entryId,
				reason.category,
				reason.kind,
				reason.scope,
				reason.actualGrade,
				reason.rank,
				reason.threshold,
			]);
			if (!seen.has(key)) {
				seen.add(key);
				merged.push(reason);
			}
		}
	}
	return merged;
}

/** A student is eligible once, even when several reasons support eligibility. */
export function stateEligibleStudentIds(reasons: QualificationReason[]): Set<string> {
	return new Set(reasons.flatMap((reason) => reason.studentIds));
}
