import { describe, expect, it } from 'vitest';
import { DevelopmentEmailProvider, ResendEmailProvider, createEmailProvider } from './email';

describe('email providers', () => {
	it('logs development links without sending mail', async () => {
		const messages: string[] = [];
		await new DevelopmentEmailProvider((message) => messages.push(message)).sendSignInLink({ to: 'coach@example.com', url: 'https://example.com/link', expiresAt: 1 });
		expect(messages[0]).toContain('https://example.com/link');
	});

	it('uses a fetch-based provider suitable for Cloudflare Workers', async () => {
		let request: Request | undefined;
		const fetcher: typeof fetch = async (input, init) => {
			request = new Request(input, init);
			return new Response('', { status: 202 });
		};
		await new ResendEmailProvider('test-key', 'WSMC <noreply@example.com>', fetcher).sendSignInLink({ to: 'coach@example.com', url: 'https://example.com/link', expiresAt: 1 });
		expect(request?.url).toBe('https://api.resend.com/emails');
		expect(request?.headers.get('authorization')).toBe('Bearer test-key');
		expect(await request?.json()).toMatchObject({ to: ['coach@example.com'] });
	});

	it('defaults to development and selects production credentials when available', () => {
		expect(createEmailProvider({})).toBeInstanceOf(DevelopmentEmailProvider);
		expect(createEmailProvider({ EMAIL_API_KEY: 'key', EMAIL_FROM: 'from@example.com' })).toBeInstanceOf(ResendEmailProvider);
	});
});
