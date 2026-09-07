import { describe, expect, it } from 'vitest';
import { exportScoreCsvFromDb } from './csv-service';

describe('score CSV contest scope', () => {
	it('exports state contest entries through the shared scoring workflow', async () => {
		const contest = { id: 'state-1', kind: 'state', lifecycle: 'scoring' };
		let selectCalls = 0;
		const query = {
			leftJoin() { return query; },
			where: async () => [{ entry: { id: 'entry-state-1', category: 'project', division: 1, entryNumber: 1 }, result: null, schoolName: 'Alpha', schoolFullName: 'Alpha High' }],
		};
		const db = {
			select: () => ({ from: () => ({
				leftJoin() { return query; },
				where: async () => selectCalls++ === 0 ? [contest] : query.where(),
			}) }),
		} as never;
		const csv = await exportScoreCsvFromDb(db, 'state-1');
		expect(csv).toContain('wsmc.scores.v1');
		expect(csv).toContain('entry-state-1');
	});
});
