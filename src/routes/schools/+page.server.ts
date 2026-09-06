import { error, fail } from '@sveltejs/kit';
import { createSchool, SchoolDirectoryError, setSchoolActive } from '$lib/server/program/schools';
import { getDb, schema } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

function requireCoordinator(locals: App.Locals): void {
	if (!locals.principal || locals.principal.statewideSeasonIds.length === 0) throw error(403, 'Coordinator access required.');
}

function value(data: FormData, name: string): string {
	const item = data.get(name);
	return typeof item === 'string' ? item.trim() : '';
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireCoordinator(locals);
	if (!platform?.env.DB) throw error(503, 'Database unavailable.');
	const schools = await getDb(platform.env.DB).select().from(schema.schools).orderBy(schema.schools.name);
	return { schools };
};

export const actions: Actions = {
	create: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		try {
			const result = await createSchool(getDb(platform.env.DB), {
				name: value(data, 'name'), shortName: value(data, 'shortName'), address: value(data, 'address'), city: value(data, 'city'), state: value(data, 'state'), postalCode: value(data, 'postalCode'), contactEmail: value(data, 'contactEmail'), confirmDuplicate: data.get('confirmDuplicate') === 'yes',
			});
			return { success: `Added ${result.school.name}.` };
		} catch (cause) {
			if (cause instanceof SchoolDirectoryError) return fail(cause.code === 'duplicate_suggestion' ? 409 : 400, { error: cause.message, duplicates: cause.duplicates, name: value(data, 'name'), city: value(data, 'city') });
			return fail(400, { error: 'School could not be added.' });
		}
	},
	setActive: async ({ locals, platform, request }) => {
		requireCoordinator(locals);
		if (!platform?.env.DB) throw error(503, 'Database unavailable.');
		const data = await request.formData();
		const schoolId = value(data, 'schoolId');
		if (!schoolId) return fail(400, { error: 'School is required.' });
		try {
			await setSchoolActive(getDb(platform.env.DB), schoolId, value(data, 'active') === 'yes');
			return { success: 'School status updated.' };
		} catch (cause) {
			return fail(400, { error: cause instanceof SchoolDirectoryError ? cause.message : 'School status could not be updated.' });
		}
	},
};
