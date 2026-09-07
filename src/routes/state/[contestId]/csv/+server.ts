import { error } from '@sveltejs/kit';
import { canCoordinateState, canCoachSchool } from '$lib/server/auth/capabilities';
import { getDb } from '$lib/server/db';
import { exportStateRosterCsv } from '$lib/server/state/csv';
import { getStateRosterRows } from '$lib/server/state/service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform, params }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const state = await getStateRosterRows(db, params.contestId);
	const statewide = canCoordinateState(locals.principal, state.seasonId);
	const schoolId = statewide ? undefined : state.qualifiedSchoolIds.find((candidate) => canCoachSchool(locals.principal!, candidate, state.seasonId));
	if (!statewide && !schoolId) throw error(403, 'You cannot export this state roster.');
	const rows = await getStateRosterRows(db, params.contestId, schoolId);
	return new Response(exportStateRosterCsv(rows.rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${state.contestId}-state-roster.csv"` } });
};
