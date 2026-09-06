export type ReadinessRegion = { id: string; number: number; name: string };
export type ReadinessContest = { id: string; kind: 'regional' | 'state'; regionId: string | null; settingsJson: string };
export type ReadinessParticipation = { contestId: string; invitationStatus: 'pending' | 'invited' | 'accepted' | 'declined' };

export function computeSeasonReadiness(input: { seasonId: string; regions: ReadinessRegion[]; contests: ReadinessContest[]; participations: ReadinessParticipation[] }) {
	const regionalContestRegionIds = new Set(input.contests.filter((contest) => contest.kind === 'regional' && contest.regionId).map((contest) => contest.regionId));
	const regionalContestIds = new Set(input.contests.filter((contest) => contest.kind === 'regional').map((contest) => contest.id));
	const stateContest = input.contests.some((contest) => {
		if (contest.kind !== 'state') return false;
		try {
			const settings = JSON.parse(contest.settingsJson) as Record<string, unknown>;
			return typeof settings.topicalIndividualAllowed === 'boolean' && typeof settings.crossSchoolTopicalTeamsAllowed === 'boolean';
		} catch {
			return false;
		}
	});
	const regionalParticipations = input.participations.filter((participation) => regionalContestIds.has(participation.contestId));
	return {
		seasonId: input.seasonId,
		regionsReady: input.regions.length > 0 && input.regions.every((region) => regionalContestRegionIds.has(region.id)),
		missingRegionalContestRegions: input.regions.filter((region) => !regionalContestRegionIds.has(region.id)).map((region) => region.name || `Region ${region.number}`),
		stateContestReady: stateContest,
		contestCount: input.contests.length,
		participationCount: regionalParticipations.length,
		outstandingInvitationCount: regionalParticipations.filter((participation) => participation.invitationStatus === 'pending' || participation.invitationStatus === 'invited').length,
		acceptedParticipationCount: regionalParticipations.filter((participation) => participation.invitationStatus === 'accepted').length,
	};
}
