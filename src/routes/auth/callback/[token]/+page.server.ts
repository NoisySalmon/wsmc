import { redirect, fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { AuthError, consumeSignInToken, SESSION_COOKIE, SESSION_TTL_MS } from '$lib/server/auth/service';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'same-origin' });
	return {};
};

// GET (including email scanners and prefetching) never consumes a credential.
export const actions: Actions = {
	default: async ({ params, platform, cookies, url, setHeaders }) => {
		try {
			const result = await consumeSignInToken(getDb(platform!.env.DB), params.token);
			cookies.set(SESSION_COOKIE, result.sessionId, {
				path: '/', httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax',
				maxAge: Math.floor(SESSION_TTL_MS / 1000),
			});
		} catch (cause) {
			if (cause instanceof AuthError) return fail(400, { error: cause.message });
			throw cause;
		}
		setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'same-origin' });
		throw redirect(303, '/');
	},
};
