import { redirect } from '@sveltejs/kit';
import { canAdministerUsers } from '$lib/server/auth/capabilities';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.principal && canAdministerUsers(locals.principal)) throw redirect(303, '/admin/users');
	return { principal: locals.principal };
};
