import { json, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { revokeSession, SESSION_COOKIE } from '$lib/server/auth/service';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, platform }) => {
	const sessionId = cookies.get(SESSION_COOKIE);
	if (sessionId && platform?.env.DB) await revokeSession(getDb(platform.env.DB), sessionId);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	if (platform?.env.DB) throw redirect(303, '/login');
	return json({ ok: true });
};
