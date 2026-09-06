export type Principal = {
	id: string;
	email: string;
	displayName: string;
	statewideSeasonIds: (string | null)[];
	regionalContestIds: string[];
	coachAssignments: { seasonId: string; schoolId: string }[];
	scorekeeperContestIds: string[];
};

export function canCoordinateState(principal: Principal, seasonId: string): boolean {
	return principal.statewideSeasonIds.some((assignedSeasonId) => assignedSeasonId === null || assignedSeasonId === seasonId);
}

/** User administration is reserved for system-wide coordinators. */
export function canAdministerUsers(principal: Principal): boolean {
	return principal.statewideSeasonIds.includes(null);
}

export function canCoordinateRegion(principal: Principal, contestId: string, seasonId?: string): boolean {
	return (seasonId !== undefined && canCoordinateState(principal, seasonId)) || principal.regionalContestIds.includes(contestId);
}

export function canCoachSchool(principal: Principal, schoolId: string, seasonId?: string): boolean {
	return principal.coachAssignments.some((assignment) => assignment.schoolId === schoolId && (seasonId === undefined || assignment.seasonId === seasonId));
}

export function canScoreContest(principal: Principal, contestId: string, seasonId?: string): boolean {
	return (seasonId !== undefined && canCoordinateState(principal, seasonId))
		|| principal.regionalContestIds.includes(contestId)
		|| principal.scorekeeperContestIds.includes(contestId);
}

export function canAdministerSchool(principal: Principal, contestId: string, schoolId: string, seasonId?: string): boolean {
	return (seasonId !== undefined && canCoordinateRegion(principal, contestId, seasonId)) || canCoachSchool(principal, schoolId, seasonId);
}

export function canEditRoster(principal: Principal, contestId: string, schoolId: string, seasonId?: string): boolean {
	return canAdministerSchool(principal, contestId, schoolId, seasonId);
}

export function canFinalizeContest(principal: Principal, contestId: string, seasonId?: string): boolean {
	return seasonId !== undefined && canCoordinateRegion(principal, contestId, seasonId);
}
