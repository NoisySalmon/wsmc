import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { createEmailProvider } from '$lib/server/auth/email';
import { findUserByEmail, sendSignInLink } from '$lib/server/auth/service';
import { normalizeEmail } from '$lib/server/auth/crypto';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({ next: url.searchParams.get('next') ?? '/' });

export const actions: Actions = {
	default: async ({ request, platform, url }) => {
		const email = normalizeEmail(String((await request.formData()).get('email') ?? ''));
		if (!email || !email.includes('@')) return fail(400, { error: 'Enter a valid email address.' });
		const db = getDb(platform!.env.DB);
		const user = await findUserByEmail(db, email);
		if (user && user.status !== 'disabled') {
			const provider = createEmailProvider(platform!.env, (message) => console.info(message));
			await sendSignInLink(db, provider, { userId: user.id, email: user.email, origin: platform!.env.APP_ORIGIN ?? url.origin });
		}
		// Keep unknown and disabled accounts indistinguishable from a valid request.
		return { success: true, message: 'If that email is invited to WSMC, a sign-in link is on its way.' };
	},
};
