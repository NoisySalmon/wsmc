import { describe, expect, it } from 'vitest';
import { computeSeasonReadiness } from './readiness';

describe('season setup readiness', () => {
	it('reports missing regional contests and outstanding invitations', () => {
		const readiness = computeSeasonReadiness({
			seasonId: 'season-1',
			regions: [{ id: 'region-1', number: 1, name: 'North' }, { id: 'region-2', number: 2, name: 'South' }],
			contests: [{ id: 'contest-1', kind: 'regional', regionId: 'region-1', settingsJson: '{}' }],
			participations: [{ contestId: 'contest-1', invitationStatus: 'invited' }, { contestId: 'contest-1', invitationStatus: 'accepted' }],
		});
		expect(readiness.regionsReady).toBe(false);
		expect(readiness.missingRegionalContestRegions).toEqual(['South']);
		expect(readiness.stateContestReady).toBe(false);
		expect(readiness.outstandingInvitationCount).toBe(1);
		expect(readiness.acceptedParticipationCount).toBe(1);
	});

	it('is ready when every region and the state contest exist', () => {
		const readiness = computeSeasonReadiness({ seasonId: 'season-1', regions: [{ id: 'region-1', number: 1, name: 'North' }], contests: [{ id: 'contest-1', kind: 'regional', regionId: 'region-1', settingsJson: '{}' }, { id: 'state', kind: 'state', regionId: null, settingsJson: '{"topicalIndividualAllowed":true,"crossSchoolTopicalTeamsAllowed":false}' }], participations: [] });
		expect(readiness.regionsReady).toBe(true);
		expect(readiness.stateContestReady).toBe(true);
	});
});
