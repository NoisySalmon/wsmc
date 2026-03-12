import { getDb, schema } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform!.env.DB);
	const contests = await db.select().from(schema.contests);
	return { contests };
};

export const actions: Actions = {
	create: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const region = Number(data.get('region'));
		const year = Number(data.get('year'));
		const name = data.get('name') as string;
		const contestChair = (data.get('contest_chair') as string) || '';
		const regionalDirector = (data.get('regional_director') as string) || '';

		if (!name || !region || !year) {
			return fail(400, { error: 'Name, region, and year are required.' });
		}

		const [contest] = await db.insert(schema.contests).values({
			region,
			year,
			name,
			contestChair,
			regionalDirector,
		}).returning();

		throw redirect(303, `/contests/${contest.id}`);
	},
};
