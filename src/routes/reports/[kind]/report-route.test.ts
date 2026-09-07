import { describe, expect, it } from 'vitest';
import { GET } from './+server';

describe('report endpoint authorization', () => {
	it('rejects unauthenticated report downloads before touching the database', async () => {
		await expect(GET({
			locals: { principal: null, sessionId: null }, platform: undefined,
			params: { kind: 'results' }, url: new URL('https://wsmc.example/reports/results?contestId=contest-1'),
		} as never)).rejects.toMatchObject({ status: 401 });
	});
});
