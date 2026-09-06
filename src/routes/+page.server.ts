import { redirect } from '@sveltejs/kit';
import { canAdministerUsers } from '$lib/server/auth/capabilities';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.principal && locals.principal.statewideSeasonIds.length > 0) throw redirect(303, '/program');
	return { principal: locals.principal };
};
