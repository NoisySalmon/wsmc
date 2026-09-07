import type { RegionalResultRow } from '$lib/server/scoring/rankings';

export type CutoffCategory = 'team_contest' | 'topical_team' | 'topical_individual';
export type CutoffThresholds = Record<CutoffCategory, { 1: number | null; 2: number | null }>;
export type CutoffCandidate = RegionalResultRow & { threshold: number; alreadyQualified: boolean; added: boolean };

/** Preview score-cutoff additions without writing qualifications. */
export function previewStateCutoffs(rows: RegionalResultRow[], thresholds: CutoffThresholds, alreadyQualifiedEntryIds: Set<string>): CutoffCandidate[] {
	const output: CutoffCandidate[] = [];
	for (const row of rows) {
		if (!['team_contest', 'topical_team', 'topical_individual'].includes(row.category) || row.score === null) continue;
		const threshold = thresholds[row.category as CutoffCategory][row.division as 1 | 2];
		if (threshold === null || threshold === undefined || row.score < threshold) continue;
		const alreadyQualified = alreadyQualifiedEntryIds.has(row.entryId);
		output.push({ ...row, threshold, alreadyQualified, added: !alreadyQualified });
	}
	return output.sort((a, b) => a.category.localeCompare(b.category) || a.division - b.division || b.score! - a.score! || a.entryId.localeCompare(b.entryId));
}
