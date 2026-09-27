import { canCoordinateRegion, type Principal } from '$lib/server/auth/capabilities';

export function canManageRegionalContestStaff(principal: Principal, contest: { id: string; seasonId: string; kind: string }): boolean {
	return contest.kind === 'regional' && canCoordinateRegion(principal, contest.id, contest.seasonId);
}
