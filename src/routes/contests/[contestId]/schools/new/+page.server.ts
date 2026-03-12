import { getDb, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = getDb(platform!.env.DB);
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, params.contestId));
	if (!contest) throw error(404, 'Contest not found');
	return { contest };
};

export const actions: Actions = {
	default: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const name = data.get('name') as string;
		const shortName = (data.get('short_name') as string) || '';
		const division = Number(data.get('division'));
		const coachName = (data.get('coach_name') as string) || '';
		const coachEmail = (data.get('coach_email') as string) || '';
		const coachPhone = (data.get('coach_phone') as string) || '';
		const address = (data.get('address') as string) || '';
		const cityZip = (data.get('city_zip') as string) || '';

		if (!name || (division !== 1 && division !== 2)) {
			return fail(400, { error: 'Name is required and division must be 1 or 2.' });
		}

		await db.insert(schema.schools).values({
			contestId: params.contestId,
			name,
			shortName,
			division,
			coachName,
			coachEmail,
			coachPhone,
			address,
			cityZip,
		});

		throw redirect(303, `/contests/${params.contestId}`);
	},
};
