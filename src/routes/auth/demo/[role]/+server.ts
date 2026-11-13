import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	consumeSignInToken, findUserByEmail, issueSignInToken, revokeSession,
	SESSION_COOKIE, SESSION_TTL_MS,
} from '$lib/server/auth/service';
import type { RequestHandler } from './$types';

const roles: Record<string, { email: string; destination: string }> = {
	state: { email: 'coordinator@wsmc.example', destination: '/' },
	regional: { email: 'regional5@wsmc.example', destination: '/scoring/contest-region-5' },
	coach: { email: 'coach.hanford@wsmc.example', destination: '/my-schools' },
};

/** Reusable fixture sign-in for a loopback Vite server only. Never enabled in a build. */
export const GET: RequestHandler = async ({ params, platform, cookies, locals, url }) => {
	if (!dev || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
		|| platform?.env.ENVIRONMENT === 'production') throw error(404, 'Not found');
	const role = Object.hasOwn(roles, params.role) ? roles[params.role] : undefined;
	if (!role) throw error(404, 'Unknown demo role');
	const db = getDb(platform!.env.DB);
	const user = await findUserByEmail(db, role.email)
		?? (params.role === 'coach' ? await findUserByEmail(db, 'coach-r2-s1@wsmc.example') : null);
	if (!user || user.status !== 'active') throw error(404, 'Active showcase account not found');
	const token = await issueSignInToken(db, { userId: user.id });
	const session = await consumeSignInToken(db, token.rawToken);
	if (locals.sessionId) await revokeSession(db, locals.sessionId);
	cookies.set(SESSION_COOKIE, session.sessionId, {
		path: '/', httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax',
		maxAge: Math.floor(SESSION_TTL_MS / 1000),
	});
	throw redirect(303, role.destination);
};
