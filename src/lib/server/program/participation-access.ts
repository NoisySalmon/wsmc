import { canCoachSchool, canCoordinateRegion, canCoordinateState, type Principal } from '$lib/server/auth/capabilities';

export function canCoachRespondForSchool(principal: Principal, schoolId: string, seasonId: string): boolean {
	return canCoachSchool(principal, schoolId, seasonId);
}

export function canManageParticipationResponse(principal: Principal, input: { contestId: string; schoolId: string; seasonId: string }): boolean {
	return canCoordinateState(principal, input.seasonId)
		|| canCoordinateRegion(principal, input.contestId, input.seasonId)
		|| canCoachSchool(principal, input.schoolId, input.seasonId);
}
