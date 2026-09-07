import { describe, expect, it } from 'vitest';
import { canManageSeasonAssignments } from '$lib/server/program/access';

const regionalCoordinator = {
	id: 'regional-coordinator', email: 'regional@example.com', displayName: 'Regional Coordinator',
	statewideSeasonIds: [], regionalContestIds: ['contest-region-1'], coachAssignments: [], scorekeeperContestIds: [],
};

function sequenceDb(rows: unknown[][]) {
	return { select: () => ({ from: () => ({ where: async () => rows.shift() ?? [] }) }) } as never;
}

describe('participation assignment authorization', () => {
	it('allows a regional coordinator to manage a participating school in their contest', async () => {
		const db = sequenceDb([[{ id: 'contest-region-1' }], [{ schoolId: 'school-alpha' }]]);
		await expect(canManageSeasonAssignments(db, regionalCoordinator, 'season-2026', 'school-alpha')).resolves.toBe(true);
	});

	it('rejects a regional coordinator attempting to manage another contest school', async () => {
		const db = sequenceDb([[{ id: 'contest-region-1' }], []]);
		await expect(canManageSeasonAssignments(db, regionalCoordinator, 'season-2026', 'school-beta')).resolves.toBe(false);
	});
});
