import { redirect, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { consumeSignInToken, SESSION_COOKIE, SESSION_TTL_MS } from '$lib/server/auth/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, cookies, url }) => {
	try {
		const result = await consumeSignInToken(getDb(platform!.env.DB), params.token);
		cookies.set(SESSION_COOKIE, result.sessionId, {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: Math.floor(SESSION_TTL_MS / 1000),
		});
		throw redirect(303, '/');
	} catch (caught) {
		if (caught && typeof caught === 'object' && 'status' in caught) throw caught;
		throw error(400, caught instanceof Error ? caught.message : 'This sign-in link is invalid or expired.');
	}
};
