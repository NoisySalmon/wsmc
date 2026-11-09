import type { RegionalResultRow } from '$lib/server/scoring/rankings';

export type CutoffCategory = 'project' | 'team_contest' | 'topical_team' | 'topical_individual';
export type CutoffThresholds = Record<CutoffCategory, { 1: number | null; 2: number | null }>;
export type CutoffCandidate = RegionalResultRow & { threshold: number; alreadyQualified: boolean; added: boolean };

/** Preview score-cutoff additions without writing qualifications. */
export function previewStateCutoffs(rows: RegionalResultRow[], thresholds: CutoffThresholds, alreadyQualifiedEntryIds: Set<string>): CutoffCandidate[] {
	const output: CutoffCandidate[] = [];
	for (const row of rows) {
		if (!['project', 'team_contest', 'topical_team', 'topical_individual'].includes(row.category) || row.score === null) continue;
		const threshold = thresholds[row.category as CutoffCategory]?.[row.division as 1 | 2];
		if (threshold === null || threshold === undefined || row.score < threshold) continue;
		const alreadyQualified = alreadyQualifiedEntryIds.has(row.entryId);
		output.push({ ...row, threshold, alreadyQualified, added: !alreadyQualified });
	}
	return output.sort((a, b) => a.category.localeCompare(b.category) || a.division - b.division || b.score! - a.score! || a.entryId.localeCompare(b.entryId));
}

export const historical2026Cutoffs: CutoffThresholds = {
	project: { 1: 0, 2: 0 }, team_contest: { 1: 14, 2: 10 }, topical_team: { 1: 89, 2: 68 }, topical_individual: { 1: 50, 2: 50 },
};
export type PlanningData = {
	rows: RegionalResultRow[]; automaticEntryIds: string[];
	members: { entryId: string; studentId: string; studentName?: string }[]; finalized: number; total: number;
};

/** Count annual identities, never team slots or qualification reasons. */
export function summarizePlan(planning: PlanningData, thresholds: CutoffThresholds) {
	const automatic = new Set(planning.automaticEntryIds);
	const candidates = previewStateCutoffs(planning.rows, thresholds, automatic);
	const additions = candidates.filter((row) => row.added);
	const eligible = new Set([...automatic, ...additions.map((row) => row.entryId)]);
	const automaticStudents = new Set(planning.members.filter((member) => automatic.has(member.entryId)).map((member) => member.studentId));
	const students = new Set(planning.members.filter((member) => eligible.has(member.entryId)).map((member) => member.studentId));
	const eventSummaries = Object.fromEntries(
		(['project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown'] as const).flatMap(category =>
			[1, 2].map(division => {
				const eventEntries = new Set(planning.rows.filter(row => row.category === category && row.division === division).map(row => row.entryId));
				const automaticIds = new Set([...automatic].filter(id => eventEntries.has(id)));
				const cutoffIds = new Set(additions.filter(row => row.category === category && row.division === division).map(row => row.entryId));
				const totalIds = new Set([...automaticIds, ...cutoffIds]);
				const population = (ids: Set<string>) => new Set(planning.members.filter(member => ids.has(member.entryId)).map(member => member.studentId)).size;
				return [`${category}:${division}`, {
					automaticEntries: automaticIds.size, cutoffEntries: cutoffIds.size, totalEntries: totalIds.size,
					automaticStudents: population(automaticIds), cutoffStudents: population(cutoffIds), students: population(totalIds),
				}];
			})
		)
	);
	return { candidates, additions, eventSummaries, automaticEntries: automatic.size, eligibleEntries: eligible.size, automaticStudents: automaticStudents.size, students: students.size, addedStudents: students.size - automaticStudents.size };
}
