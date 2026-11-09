export type Principal = {
	id: string;
	email: string;
	displayName: string;
	isAdmin: boolean;
	regionalContestIds: string[];
	coachAssignments: { schoolId: string }[];
	scorekeeperContestIds: string[];
};

export function canCoordinateState(principal: Principal, _seasonId: string): boolean {
	return canAdministerUsers(principal);
}

/** Administrator access is independent of the competition season. */
export function canAdministerUsers(principal: Principal): boolean {
	return principal.isAdmin;
}

export function canCoordinateRegion(principal: Principal, contestId: string, seasonId?: string): boolean {
	return (seasonId !== undefined && canCoordinateState(principal, seasonId)) || principal.regionalContestIds.includes(contestId);
}

export function canCoachSchool(principal: Principal, schoolId: string, _seasonId?: string): boolean {
	return principal.coachAssignments.some((assignment) => assignment.schoolId === schoolId);
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
