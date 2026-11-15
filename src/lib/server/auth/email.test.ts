import { describe, expect, it } from 'vitest';
import { DevelopmentEmailProvider, ResendEmailProvider, createEmailProvider, resolveAppOrigin } from './email';

describe('email providers', () => {
	it('logs development links without sending mail', async () => {
		const messages: string[] = [];
		await new DevelopmentEmailProvider((message) => messages.push(message)).sendSignInLink({ to: 'coach@example.com', url: 'https://example.com/link', expiresAt: 1 });
		expect(messages[0]).toContain('https://example.com/link');
	});

	it.each([['2026-01-16T23:30:00Z', '3:30 PM'], ['2026-07-16T22:30:00Z', '3:30 PM']])('sends Pacific expiration times through the Workers provider (%s)', async (expiry, localTime) => {
		let request: Request | undefined;
		const fetcher: typeof fetch = async (input, init) => {
			request = new Request(input, init);
			return new Response('', { status: 202 });
		};
		await new ResendEmailProvider('test-key', 'WSMC <noreply@example.com>', fetcher).sendSignInLink({ to: 'coach@example.com', url: 'https://example.com/link', expiresAt: Date.parse(expiry) });
		expect(request?.url).toBe('https://api.resend.com/emails');
		expect(request?.headers.get('authorization')).toBe('Bearer test-key');
		const body = await request!.json() as { text: string };
		expect(body).toMatchObject({ to: ['coach@example.com'] });
		expect(body.text).toContain(`${localTime} Pacific time`);
		expect(body.text).toContain('expires in 24 hours');
	});

	it('defaults to development and selects production credentials when available', () => {
		expect(createEmailProvider({})).toBeInstanceOf(DevelopmentEmailProvider);
		expect(createEmailProvider({ EMAIL_API_KEY: 'key', EMAIL_FROM: 'from@example.com' })).toBeInstanceOf(ResendEmailProvider);
		expect(() => createEmailProvider({ ENVIRONMENT: 'production' })).toThrow(/not configured/);
	});

	it('requires a trusted HTTPS origin in production', () => {
		expect(resolveAppOrigin({ ENVIRONMENT: 'production', APP_ORIGIN: 'https://wsmc.example/' }, 'http://request.example')).toBe('https://wsmc.example');
		expect(() => resolveAppOrigin({ ENVIRONMENT: 'production' }, 'https://request.example')).toThrow(/not configured/);
		expect(() => resolveAppOrigin({ ENVIRONMENT: 'production', APP_ORIGIN: 'http://wsmc.example' }, 'https://request.example')).toThrow(/valid HTTP/);
		expect(resolveAppOrigin({}, 'https://localhost:8790/path')).toBe('https://localhost:8790');
	});
});
