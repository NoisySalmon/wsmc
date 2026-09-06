import { describe, expect, it } from 'vitest';
import { SchoolDirectoryError, createSchool, normalizeSchoolName } from './schools';

describe('school directory', () => {
	it('normalizes names for duplicate suggestions', () => {
		expect(normalizeSchoolName('  Lincoln   High-School ')).toBe('lincoln high school');
	});

	it('suggests same-city duplicates before inserting', async () => {
		const db = {
			select: () => ({ from: async () => [{ id: 'school-1', name: 'Lincoln High School', city: 'Seattle', active: true }] }),
		};
		await expect(createSchool(db as never, { name: 'Lincoln High-School', city: 'Seattle' })).rejects.toMatchObject({ code: 'duplicate_suggestion', duplicates: [{ id: 'school-1' }] });
	});

	it('requires a name and city before querying', async () => {
		await expect(createSchool({} as never, { name: '', city: '' })).rejects.toBeInstanceOf(SchoolDirectoryError);
	});
});
