import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { createEmailProvider, resolveAppOrigin } from '$lib/server/auth/email';
import { AuthError, findUserByEmail, sendSignInLink } from '$lib/server/auth/service';
import { allowAuthRequest } from '$lib/server/auth/rate-limit';
import { normalizeEmail } from '$lib/server/auth/crypto';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({ next: url.searchParams.get('next') ?? '/' });

export const actions: Actions = {
	default: async ({ request, platform, url, getClientAddress, setHeaders }) => {
		const email = normalizeEmail(String((await request.formData()).get('email') ?? ''));
		if (!email || !email.includes('@')) return fail(400, { error: 'Enter a valid email address.' });
		const db = getDb(platform!.env.DB);
		const ip = request.headers.get('cf-connecting-ip') ?? getClientAddress();
		if (!await allowAuthRequest(db, 'ip', ip)) {
			setHeaders({ 'retry-after': '600' });
			return fail(429, { error: 'Too many sign-in requests. Please try again in ten minutes.' });
		}
		const user = await findUserByEmail(db, email);
		if (user && user.status !== 'disabled') {
			const provider = createEmailProvider(platform!.env, (message) => console.info(message));
			try {
				await sendSignInLink(db, provider, { userId: user.id, email: user.email, origin: resolveAppOrigin(platform!.env, url.origin) });
			} catch (cause) {
				if (!(cause instanceof AuthError && cause.code === 'rate_limited')) {
					// Keep provider failures from identifying which accounts exist.
					console.error(JSON.stringify({ source: 'wsmc_email', event: 'sign_in_delivery_failed' }));
				}
			}
		}
		// Keep unknown and disabled accounts indistinguishable from a valid request.
		return { success: true, message: 'If that email has access to WSMC, a sign-in link is on its way. If you just requested one, check your inbox or wait one minute before trying again.' };
	},
};
