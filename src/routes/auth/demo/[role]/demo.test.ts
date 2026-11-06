import { beforeEach, describe, expect, it, vi } from 'vitest';

const environment = vi.hoisted(() => ({ dev: true }));
vi.mock('$app/environment', () => environment);
import { GET } from './+server';

describe('local demo sign-in boundary', () => {
	beforeEach(() => { environment.dev = true; });

	it.each([
		{ dev: false, origin: 'http://127.0.0.1', production: false },
		{ dev: true, origin: 'https://wsmc.pages.dev', production: false },
		{ dev: true, origin: 'http://127.0.0.1', production: true },
	])('rejects unavailable demo sign-in: %j', async ({ dev, origin, production }) => {
		environment.dev = dev;
		await expect(GET({
			url: new URL(`${origin}/auth/demo/state`),
			platform: { env: { ENVIRONMENT: production ? 'production' : 'development' } },
		} as Parameters<typeof GET>[0])).rejects.toMatchObject({ status: 404 });
	});

	it.each(['unknown', '__proto__'])('rejects an unknown role %s before accessing data', async (role) => {
		await expect(GET({
			url: new URL(`http://127.0.0.1/auth/demo/${role}`), params: { role },
		} as Parameters<typeof GET>[0])).rejects.toMatchObject({ status: 404 });
	});
});
