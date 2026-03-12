import { getDb, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = getDb(platform!.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));

	if (!contest) throw error(404, 'Contest not found');

	const schools = await db.select().from(schema.schools).where(eq(schema.schools.contestId, contest.id));

	return { contest, schools };
};

export const actions: Actions = {
	update: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const name = data.get('name') as string;
		const region = Number(data.get('region'));
		const year = Number(data.get('year'));
		const contestChair = (data.get('contest_chair') as string) || '';
		const regionalDirector = (data.get('regional_director') as string) || '';
		const status = data.get('status') as string;

		if (!name || !region || !year) {
			return fail(400, { error: 'Name, region, and year are required.' });
		}

		await db.update(schema.contests).set({
			name,
			region,
			year,
			contestChair,
			regionalDirector,
			status: status as 'setup' | 'active' | 'scoring' | 'finalized',
		}).where(eq(schema.contests.id, params.contestId));

		return { success: true };
	},

	delete: async ({ params, platform }) => {
		const db = getDb(platform!.env.DB);
		await db.delete(schema.contests).where(eq(schema.contests.id, params.contestId));
		throw redirect(303, '/contests');
	},
};
