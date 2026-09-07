import { describe, expect, it } from 'vitest';
import { createStateEntry, StateError } from './service';

function contestDb(settingsJson: string) {
	return {
		select: () => ({
			from: () => ({
				where: async () => [{ id: 'state-1', kind: 'state', lifecycle: 'registration_open', seasonId: 'season-1', settingsJson }],
			}),
		}),
	} as never;
}

describe('state administration rules', () => {
	it('requires explicit state policy settings', async () => {
		await expect(createStateEntry(contestDb('{}'), { contestId: 'state-1', category: 'project', division: 1, actorUserId: 'user-1' })).rejects.toMatchObject({ code: 'invalid_settings' });
	});

	it('enforces the configured Topical Individual policy before persistence', async () => {
		const db = contestDb(JSON.stringify({ topicalIndividualAllowed: false, crossSchoolTopicalTeamsAllowed: false }));
		await expect(createStateEntry(db, { contestId: 'state-1', category: 'topical_individual', division: 1, actorUserId: 'user-1' })).rejects.toMatchObject({ code: 'policy_blocked' });
	});

	it('rejects malformed category values at the service boundary', async () => {
		const db = contestDb(JSON.stringify({ topicalIndividualAllowed: true, crossSchoolTopicalTeamsAllowed: false }));
		await expect(createStateEntry(db, { contestId: 'state-1', category: 'not-a-category' as never, division: 1, actorUserId: 'user-1' })).rejects.toMatchObject({ code: 'invalid_category' });
	});

	it('exposes a stable state-domain error type', () => {
		expect(new StateError('example', 'example')).toBeInstanceOf(Error);
	});
});
