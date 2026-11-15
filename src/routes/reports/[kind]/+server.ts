import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { exportSeasonSnapshot, snapshotKinds, type SnapshotKind } from '$lib/server/reports/snapshot';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform, params, url }) => {
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!snapshotKinds.includes(params.kind as SnapshotKind)) throw error(404, 'Export not found.');
	if (!locals.principal.isAdmin) throw error(403, 'Administrator access required.');
	const seasonId = url.searchParams.get('seasonId')?.trim();
	if (!seasonId) throw error(400, 'seasonId is required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const snapshot = await exportSeasonSnapshot(getDb(platform.env.DB), seasonId, params.kind as SnapshotKind);
	if (!snapshot) throw error(404, 'Season not found.');
	return new Response(new Uint8Array(snapshot.bytes), {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${snapshot.filename}"`,
			'cache-control': 'private, no-store',
		},
	});
};
