import { eq } from 'drizzle-orm';
import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { getDb, schema } from '$lib/server/db';
import { canCoordinateRegion, canCoordinateState } from '$lib/server/auth/capabilities';
import { ProgramError, setContestLifecycle, updateContestDate, type ContestLifecycle } from './service';

export async function contestAction(event: RequestEvent, kind: 'regional' | 'state', action: 'date' | 'stage') {
	const { locals, platform, params, request } = event;
	if (!locals.principal) throw error(401, 'Sign in required.');
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const db = getDb(platform.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId!));
	if (!contest) throw error(404, 'Contest not found.');
	const allowed = kind === 'state' ? canCoordinateState(locals.principal, contest.seasonId) : canCoordinateRegion(locals.principal, contest.id, contest.seasonId);
	if (contest.kind !== kind || !allowed) throw error(403, 'Contest coordinator access required.');
	const data = await request.formData();
	try {
		if (action === 'date') {
			await updateContestDate(db, contest.id, String(data.get('startsAt') ?? ''));
			return { success: 'Contest date saved.' };
		}
		const next: Partial<Record<string, ContestLifecycle>> = { setup: 'registration_open', registration_open: 'roster_locked', roster_locked: 'scoring' };
		if (!next[contest.lifecycle] || next[contest.lifecycle] !== data.get('lifecycle')) return fail(400, { error: 'Use the next available contest stage.' });
		await setContestLifecycle(db, contest.id, contest.seasonId, next[contest.lifecycle]!);
		return { success: 'Contest stage updated.' };
	} catch (cause) { return fail(400, { error: cause instanceof ProgramError ? cause.message : 'Contest could not be updated.' }); }
}
