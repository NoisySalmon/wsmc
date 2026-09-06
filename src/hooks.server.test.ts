import { describe, expect, it } from 'vitest';
import { handle } from './hooks.server';

function eventFor(path: string, method = 'GET') {
	return {
		request: new Request(`https://wsmc.example${path}`, { method }),
		url: new URL(`https://wsmc.example${path}`),
		cookies: {
			get: () => undefined,
			delete: () => undefined,
		},
		locals: {},
		platform: undefined,
	} as never;
}

describe('server authentication guard', () => {
	it('allows the login page without a session', async () => {
		const response = await handle({ event: eventFor('/login'), resolve: async () => new Response('ok') } as never);
		expect(response.status).toBe(200);
	});

	it('redirects unauthenticated page requests to login', async () => {
		await expect(handle({ event: eventFor('/contests'), resolve: async () => new Response('ok') } as never)).rejects.toMatchObject({ status: 303 });
	});

	it('rejects unauthenticated POST requests without executing the action', async () => {
		await expect(handle({ event: eventFor('/contests', 'POST'), resolve: async () => new Response('action ran') } as never)).rejects.toMatchObject({ status: 401 });
	});
});
