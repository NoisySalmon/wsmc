import { lte, sql } from 'drizzle-orm';
import { schema, type Database } from '$lib/server/db';
import { sha256 } from './crypto';

/** Atomic shared counters in D1; no per-isolate state or dashboard setup. */
export async function allowAuthRequest(db: Database, scope: 'email' | 'ip', identity: string, now = Date.now()): Promise<boolean> {
	const limit = scope === 'email' ? 1 : 60;
	const windowMs = scope === 'email' ? 60_000 : 10 * 60_000;
	const table = schema.authRequestLimits;
	const key = `${scope}:${await sha256(identity)}`;
	// Bound storage without retaining expired IP hashes indefinitely.
	await db.delete(table).where(lte(table.expiresAt, now));
	const admitted = await db.insert(table).values({ key, count: 1, expiresAt: now + windowMs })
		.onConflictDoUpdate({
			target: table.key,
			set: {
				count: sql`CASE WHEN ${table.expiresAt} <= ${now} THEN 1 ELSE ${table.count} + 1 END`,
				expiresAt: sql`CASE WHEN ${table.expiresAt} <= ${now} THEN ${now + windowMs} ELSE ${table.expiresAt} END`,
			},
			setWhere: sql`${table.expiresAt} <= ${now} OR ${table.count} < ${limit}`,
		}).returning({ key: table.key });
	return admitted.length === 1;
}
