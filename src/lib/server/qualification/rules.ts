import type { RegionalRankings, RegionalRankedResult } from '$lib/server/scoring/rankings';

export type QualificationDecision = {
	entryId: string;
	studentId: string | null;
	kind: 'regional_placement' | 'knowdown_alternate';
	rank: number;
	scope: 'overall' | 'actual_grade' | null;
	actualGrade: number | null;
	active: boolean;
};

function placementDecision(entry: RegionalRankedResult, scope: QualificationDecision['scope'] = 'overall', rank = entry.rank): QualificationDecision {
	return { entryId: entry.entryId, studentId: entry.studentId, kind: 'regional_placement', rank, scope, actualGrade: scope === 'actual_grade' ? entry.actualGrade : null, active: true };
}

function teamDecisions(entries: RegionalRankedResult[], lastRank = 1): QualificationDecision[] {
	return entries.filter((entry) => entry.rank <= lastRank).map((entry) => ({ ...placementDecision(entry), studentId: null }));
}

/** Translate finalized regional boards into explainable placement decisions. */
export function buildRegionalPlacementDecisions(rankings: RegionalRankings): QualificationDecision[] {
	const decisions: QualificationDecision[] = [
		...teamDecisions(rankings.project, 3),
		...teamDecisions(rankings.team_contest),
		...teamDecisions(rankings.topical_team),
	];
	// Overall qualifiers leave the pool before distinguished students are
	// chosen. Keep ties at both boundaries, as on the regional boards.
	const individuals = rankings.topical_individual;
	for (const entry of individuals.filter(entry => entry.rank <= 3)) {
		decisions.push(placementDecision(entry));
	}
	const remaining = individuals.filter(entry => entry.rank > 3 && entry.actualGrade !== null && entry.score !== null);
	const gradeScores = new Map<number, number>();
	for (const entry of remaining) {
		gradeScores.set(entry.actualGrade!, Math.max(gradeScores.get(entry.actualGrade!) ?? -Infinity, entry.score!));
	}
	for (const entry of remaining) {
		if (entry.score === gradeScores.get(entry.actualGrade!)) decisions.push(placementDecision(entry, 'actual_grade', 1));
	}
	for (const entry of rankings.knowdown) {
		if (entry.rank <= 3) decisions.push({ ...placementDecision(entry), studentId: entry.studentId });
		else if (entry.rank === 4) decisions.push({ entryId: entry.entryId, studentId: entry.studentId, kind: 'knowdown_alternate', rank: 4, scope: 'overall', actualGrade: null, active: false });
	}
	return decisions;
}
