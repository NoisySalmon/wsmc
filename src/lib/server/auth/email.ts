export type SignInEmail = {
	to: string;
	url: string;
	expiresAt: number;
};

export interface EmailProvider {
	sendSignInLink(message: SignInEmail): Promise<void>;
}

/** Safe local adapter: it never sends mail and only logs the development link. */
export class DevelopmentEmailProvider implements EmailProvider {
	constructor(private readonly logger: (message: string) => void = console.log) {}

	async sendSignInLink(message: SignInEmail): Promise<void> {
		this.logger(`[development email] Sign-in link for ${message.to}: ${message.url}`);
	}
}

/** Cloudflare-compatible provider using the Resend HTTP API and fetch. */
export class ResendEmailProvider implements EmailProvider {
	constructor(private readonly apiKey: string, private readonly from: string, private readonly fetcher: typeof fetch = fetch) {}

	async sendSignInLink(message: SignInEmail): Promise<void> {
		const response = await this.fetcher('https://api.resend.com/emails', {
			method: 'POST',
			headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				from: this.from,
				to: [message.to],
				subject: 'Your WSMC sign-in link',
				text: `Sign in to WSMC: ${message.url}\n\nThis link expires at ${new Date(message.expiresAt).toISOString()}.`,
			}),
		});
		if (!response.ok) throw new Error(`Email provider rejected the message (${response.status}).`);
	}
}

export function resolveAppOrigin(env: { ENVIRONMENT?: 'development' | 'production'; APP_ORIGIN?: string }, fallbackOrigin: string): string {
	const configured = env.APP_ORIGIN?.trim();
	if (!configured && env.ENVIRONMENT === 'production') throw new Error('Production app origin is not configured.');
	const candidate = configured || fallbackOrigin;
	try {
		const origin = new URL(candidate);
		if (!['http:', 'https:'].includes(origin.protocol)) throw new Error();
		if (env.ENVIRONMENT === 'production' && origin.protocol !== 'https:') throw new Error();
		return origin.origin;
	} catch {
		throw new Error('App origin must be a valid HTTP(S) URL.');
	}
}

export function createEmailProvider(env: { ENVIRONMENT?: 'development' | 'production'; EMAIL_API_KEY?: string; EMAIL_FROM?: string }, logger?: (message: string) => void): EmailProvider {
	if (env.EMAIL_API_KEY && env.EMAIL_FROM) return new ResendEmailProvider(env.EMAIL_API_KEY, env.EMAIL_FROM);
	if (env.ENVIRONMENT === 'production') throw new Error('Production email provider is not configured.');
	return new DevelopmentEmailProvider(logger);
}
