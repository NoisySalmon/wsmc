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

function placementDecision(entry: RegionalRankedResult, scope: QualificationDecision['scope'] = 'overall'): QualificationDecision {
	return { entryId: entry.entryId, studentId: entry.studentId, kind: 'regional_placement', rank: entry.rank, scope, actualGrade: scope === 'actual_grade' ? entry.actualGrade : null, active: true };
}

function teamDecisions(entries: RegionalRankedResult[]): QualificationDecision[] {
	return entries.filter((entry) => entry.rank <= 3).map((entry) => ({ ...placementDecision(entry), studentId: null }));
}

/** Translate finalized regional boards into explainable placement decisions. */
export function buildRegionalPlacementDecisions(rankings: RegionalRankings): QualificationDecision[] {
	const decisions: QualificationDecision[] = [
		...teamDecisions(rankings.project),
		...teamDecisions(rankings.team_contest),
		...teamDecisions(rankings.topical_team),
	];
	for (const entry of rankings.topical_individual) {
		if (entry.rank <= 3) decisions.push({ ...placementDecision(entry), scope: 'overall' });
		if (entry.actualGradeRank !== undefined && entry.actualGradeRank <= 3) decisions.push({ ...placementDecision(entry, 'actual_grade'), studentId: entry.studentId });
	}
	for (const entry of rankings.knowdown) {
		if (entry.rank <= 3) decisions.push({ ...placementDecision(entry), studentId: entry.studentId });
		else if (entry.rank === 4) decisions.push({ entryId: entry.entryId, studentId: entry.studentId, kind: 'knowdown_alternate', rank: 4, scope: 'overall', actualGrade: null, active: false });
	}
	return decisions;
}
