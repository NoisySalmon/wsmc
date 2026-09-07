import { describe, expect, it } from 'vitest';
import { diagnosticPathname, handle, handleError, isPublishedStateResultsPath } from './hooks.server';

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

	it('allows only the exact public state-results route', async () => {
		await expect(handle({ event: eventFor('/state/state-1/results'), resolve: async () => new Response('ok') } as never)).resolves.toMatchObject({ status: 200 });
		await expect(handle({ event: eventFor('/state/state-1/results/details'), resolve: async () => new Response('ok') } as never)).rejects.toMatchObject({ status: 303 });
		expect(isPublishedStateResultsPath('/state/state-1/results/')).toBe(true);
	});

	it('logs only safe request diagnostics for server errors', () => {
		const original = console.error;
		const lines: string[] = [];
		console.error = (line: string) => lines.push(line);
		try {
			const result = handleError({ event: eventFor('/state/state-1/results?token=do-not-log'), status: 500 } as never) as App.Error;
			expect(result.message).toBe('Unexpected server error.');
			expect(lines).toHaveLength(1);
		expect(lines[0]).not.toContain('do-not-log');
			expect(lines[0]).toContain('request_error');
			expect(diagnosticPathname('/auth/callback/raw-token-must-not-appear')).toBe('/auth/callback/[redacted]');
			expect(diagnosticPathname('/state/state-1/results')).toBe('/state/state-1/results');
		} finally {
			console.error = original;
		}
	});
});
