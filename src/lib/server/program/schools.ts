import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';

export function normalizeSchoolName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export class SchoolDirectoryError extends Error {
	constructor(public readonly code: string, message: string, public readonly duplicates: { id: string; name: string; city: string; active: boolean }[] = []) {
		super(message);
		this.name = 'SchoolDirectoryError';
	}
}

export async function createSchool(db: Database, input: { name: string; shortName?: string; address?: string; city: string; state?: string; postalCode?: string; contactEmail?: string; confirmDuplicate?: boolean; now?: number }) {
	const name = input.name.trim();
	const city = input.city.trim();
	if (!name || !city) throw new SchoolDirectoryError('invalid_request', 'School name and city are required.');
	const existing = await db.select({ id: schema.schools.id, name: schema.schools.name, city: schema.schools.city, active: schema.schools.active }).from(schema.schools);
	const duplicates = existing.filter((school) => normalizeSchoolName(school.name) === normalizeSchoolName(name) && school.city.toLowerCase() === city.toLowerCase());
	if (duplicates.length > 0 && !input.confirmDuplicate) throw new SchoolDirectoryError('duplicate_suggestion', 'A school with the same name and city already exists.', duplicates);
	const now = input.now ?? Date.now();
	const [school] = await db.insert(schema.schools).values({
		id: crypto.randomUUID(), name, shortName: input.shortName?.trim() ?? '', address: input.address?.trim() ?? '', city,
		state: input.state?.trim().toUpperCase() || 'WA', postalCode: input.postalCode?.trim() ?? '', contactEmail: input.contactEmail?.trim().toLowerCase() ?? '', active: true, createdAt: now, updatedAt: now,
	}).returning();
	return { school, duplicates };
}

export async function setSchoolActive(db: Database, schoolId: string, active: boolean, now = Date.now()): Promise<void> {
	const [school] = await db.select({ id: schema.schools.id }).from(schema.schools).where(eq(schema.schools.id, schoolId));
	if (!school) throw new SchoolDirectoryError('not_found', 'School not found.');
	await db.update(schema.schools).set({ active, updatedAt: now }).where(eq(schema.schools.id, schoolId));
}
