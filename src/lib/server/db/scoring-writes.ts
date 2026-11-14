import { sql } from 'drizzle-orm';
import type { Database } from './index';
import { schema } from './index';

/** Rechecked inside the write statement, rather than trusting an earlier read. */
export function scoringWriteAllowed(contestId: string, entryId?: string, placement?: number | null) {
	return sql`EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id
		WHERE c.id = ${contestId} AND c.lifecycle IN ('roster_locked', 'scoring') AND s.status <> 'archived')
		${entryId ? sql`AND EXISTS (SELECT 1 FROM entries e WHERE e.id = ${entryId} AND e.contest_id = ${contestId}
		AND NOT EXISTS (SELECT 1 FROM school_participations p WHERE p.contest_id = e.contest_id AND p.school_id = e.owner_school_id AND p.withdrawn_at IS NOT NULL))` : sql``}
		${placement == null ? sql`` : sql`AND NOT EXISTS (SELECT 1 FROM entries e JOIN results r ON r.entry_id = e.id
		WHERE e.contest_id = ${contestId} AND e.category = 'knowdown' AND e.id <> ${entryId ?? ''} AND r.placement = ${placement}
		AND NOT EXISTS (SELECT 1 FROM school_participations p WHERE p.contest_id = e.contest_id AND p.school_id = e.owner_school_id AND p.withdrawn_at IS NOT NULL))`}`;
}

/** Column order follows results; all inserts, including first writes, share this guard. */
export function guardedResultInsert(db: Database, values: { entryId: string; score?: number | null; part1?: number | null; part2?: number | null; placement?: number | null; knowdownOutcome?: 'placed' | 'eliminated' | null; version?: number; lastEditedBy?: string | null; updatedAt?: number }, contestId: string) {
	return db.insert(schema.results).select(sql`SELECT ${values.entryId}, ${values.score ?? null}, ${values.part1 ?? null}, ${values.part2 ?? null}, ${values.placement ?? null}, ${values.knowdownOutcome ?? null}, ${values.version ?? 1}, ${values.lastEditedBy ?? null}, ${values.updatedAt ?? Date.now()} WHERE ${scoringWriteAllowed(contestId, values.entryId, values.placement)}`);
}

/** Must immediately follow its owning mutation in the same D1 batch. */
export function scoringAudit(db: Database, input: { actorUserId: string; contestId: string; entityType: string; entityId: string; action: string; detailsJson: string; now: number }) {
	return db.insert(schema.auditEvents).select(sql`SELECT ${crypto.randomUUID()}, ${input.actorUserId}, ${input.contestId}, NULL, ${input.entityType}, ${input.entityId}, ${input.action}, ${input.detailsJson}, ${input.now} WHERE changes() > 0`);
}
