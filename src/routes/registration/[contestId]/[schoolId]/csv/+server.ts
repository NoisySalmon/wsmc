import { error } from '@sveltejs/kit';
import { canEditRoster } from '$lib/server/auth/capabilities';
import { getDb } from '$lib/server/db';
import { exportRegistrationCsvFromDb, loadRegistrationCsvScope } from '$lib/server/registration/csv-service';
import { RegistrationCsvError } from '$lib/server/registration/csv';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform, params }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	let scope;
	try {
		scope = await loadRegistrationCsvScope(db, params.contestId, params.schoolId);
	} catch (cause) {
		if (cause instanceof RegistrationCsvError && cause.code === 'not_found') throw error(404, cause.message);
		if (cause instanceof RegistrationCsvError && cause.code === 'locked') throw error(409, cause.message);
		throw cause;
	}
	const { contest, school } = scope;
	if (!canEditRoster(locals.principal, contest.id, school.id, contest.seasonId)) throw error(403, 'You cannot export this registration.');
	const csv = await exportRegistrationCsvFromDb(db, contest.id, school.id);
	const filename = `wsmc-registration-${params.contestId}-${params.schoolId}.csv`;
	return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' } });
};
