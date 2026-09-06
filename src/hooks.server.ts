import { error, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { SESSION_COOKIE, loadPrincipal } from '$lib/server/auth/service';
import type { Handle } from '@sveltejs/kit';

const publicPaths = ['/login', '/auth/callback', '/robots.txt'];

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(SESSION_COOKIE) ?? null;
	event.locals.sessionId = sessionId;
	event.locals.principal = null;

	if (event.platform?.env.DB && sessionId) {
		event.locals.principal = await loadPrincipal(getDb(event.platform.env.DB), sessionId);
		if (!event.locals.principal) event.cookies.delete(SESSION_COOKIE, { path: '/' });
	}

	const isPublic = publicPaths.some((path) => event.url.pathname === path || event.url.pathname.startsWith(`${path}/`));
	if (!isPublic && !event.locals.principal) {
		if (event.request.method !== 'GET' && event.request.method !== 'HEAD') throw error(401, 'Sign in required.');
		const next = `${event.url.pathname}${event.url.search}`;
		throw redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}
	if (event.locals.principal && event.url.pathname.startsWith('/contests')) {
		throw error(410, 'The unauthenticated prototype contest routes have been retired.');
	}

	return resolve(event);
};
