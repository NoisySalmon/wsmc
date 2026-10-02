import { and, eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { defaultRegions } from './default-regions';

export type ContestLifecycle = 'setup' | 'registration_open' | 'roster_locked' | 'scoring' | 'finalized';
export type StateContestSettings = { topicalIndividualAllowed: boolean; crossSchoolTopicalTeamsAllowed: boolean };
const lifecycleOrder: ContestLifecycle[] = ['setup', 'registration_open', 'roster_locked', 'scoring', 'finalized'];

export class ProgramError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'ProgramError';
	}
}

function requiredName(value: string, label: string): string {
	const name = value.trim();
	if (!name) throw new ProgramError('invalid_request', `${label} is required.`);
	return name;
}

export async function createSeason(db: Database, input: { year: number; name: string; now?: number; cloneAssignmentsFromSeasonId?: string | null }) {
	if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2200) {
		throw new ProgramError('invalid_year', 'Season year must be between 2000 and 2200.');
	}
	const name = requiredName(input.name, 'Season name');
	const now = input.now ?? Date.now();
	const seasonId = crypto.randomUUID();
	const regions = defaultRegions.map((region) => ({ ...region, id: crypto.randomUUID(), seasonId }));
	// D1 batches are atomic: a failed default cannot leave a partially created season.
	const [[season]] = await db.batch([
		db.insert(schema.seasons).values({
			id: seasonId, year: input.year, name, createdAt: now, updatedAt: now,
		}).returning(),
		db.insert(schema.regions).values(regions),
		// Keep individual statements below D1's bound-parameter limit.
		...regions.map((region) => db.insert(schema.contests).values({
			id: crypto.randomUUID(), seasonId, regionId: region.id, kind: 'regional' as const,
			name: `Region ${region.number} — ${region.name}`, startsAt: null,
			settingsJson: '{}', lifecycle: 'setup' as const, createdAt: now, updatedAt: now,
		})),
	]);
	// Bootstrap: new seasons start with the same season coordinators as the previous season.
	// Regional/scorekeeper/coach assignments are contest/school scoped and are not cloned.
	try {
		let sourceSeasonId = input.cloneAssignmentsFromSeasonId ?? null;
		if (!sourceSeasonId) {
			const seasons = await db.select({ id: schema.seasons.id, year: schema.seasons.year }).from(schema.seasons);
			const prior = seasons.filter((candidate) => candidate.id !== season.id).sort((a, b) => b.year - a.year)[0];
			sourceSeasonId = prior?.id ?? null;
		}
		if (sourceSeasonId) {
			const coordinators = await db.select().from(schema.statewideAssignments).where(eq(schema.statewideAssignments.seasonId, sourceSeasonId));
			for (const row of coordinators) {
				await db.insert(schema.statewideAssignments).values({ id: crypto.randomUUID(), userId: row.userId, seasonId: season.id, createdAt: now }).onConflictDoNothing();
			}
		}
	} catch {
		// Cloning is a convenience; season creation itself must succeed even if it fails.
	}
	return season;
}

export async function setSeasonStatus(db: Database, seasonId: string, status: 'setup' | 'active' | 'archived', now = Date.now()): Promise<void> {
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, seasonId));
	if (!season) throw new ProgramError('not_found', 'Season not found.');
	if (season.status === 'archived' && status !== 'archived') throw new ProgramError('archived', 'Archived seasons are read-only.');
	await db.update(schema.seasons).set({ status, updatedAt: now }).where(eq(schema.seasons.id, seasonId));
}

export async function createRegion(db: Database, input: { seasonId: string; number: number; name?: string }) {
	if (!Number.isInteger(input.number) || input.number < 1) throw new ProgramError('invalid_region', 'Region number must be a positive integer.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, input.seasonId));
	if (!season) throw new ProgramError('not_found', 'Season not found.');
	if (season.status === 'archived') throw new ProgramError('archived', 'Archived seasons are read-only.');
	const [region] = await db.insert(schema.regions).values({ id: crypto.randomUUID(), seasonId: input.seasonId, number: input.number, name: input.name?.trim() ?? '' }).returning();
	return region;
}

/** Chunk 1 invariant: one regional contest per season-region, created together with the region.
 * Creation needs only number + name; date/coordinator come later via contest metadata/staff. */
export async function createRegionWithContest(db: Database, input: { seasonId: string; number: number; name?: string; now?: number }) {
	const region = await createRegion(db, input);
	const now = input.now ?? Date.now();
	const contestName = region.name ? `Region ${region.number} — ${region.name}` : `Region ${region.number} Regional Contest`;
	try {
		const [contest] = await db.insert(schema.contests).values({
			id: crypto.randomUUID(), seasonId: input.seasonId, regionId: region.id, kind: 'regional',
			name: contestName, startsAt: null, settingsJson: '{}', lifecycle: 'setup', createdAt: now, updatedAt: now,
		}).returning();
		return { region, contest };
	} catch (cause) {
		await db.delete(schema.regions).where(eq(schema.regions.id, region.id));
		throw cause;
	}
}

/** One state contest per season. Idempotent: returns the existing one when present. */
export async function ensureStateContest(db: Database, input: { seasonId: string; name?: string; now?: number }) {
	const existing = await db.select().from(schema.contests).where(and(eq(schema.contests.seasonId, input.seasonId), eq(schema.contests.kind, 'state')));
	if (existing.length > 0) return existing[0];
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, input.seasonId));
	if (!season) throw new ProgramError('not_found', 'Season not found.');
	if (season.status === 'archived') throw new ProgramError('archived', 'Archived seasons are read-only.');
	const now = input.now ?? Date.now();
	const [contest] = await db.insert(schema.contests).values({
		id: crypto.randomUUID(), seasonId: input.seasonId, regionId: null, kind: 'state',
		name: input.name?.trim() || `${season.year} State Contest`, startsAt: null,
		settingsJson: JSON.stringify({ topicalIndividualAllowed: true, crossSchoolTopicalTeamsAllowed: false }),
		lifecycle: 'setup', createdAt: now, updatedAt: now,
	}).returning();
	return contest;
}

export async function updateRegion(db: Database, input: { regionId: string; number?: number; name?: string }) {
	const [region] = await db.select().from(schema.regions).where(eq(schema.regions.id, input.regionId));
	if (!region) throw new ProgramError('not_found', 'Region not found.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, region.seasonId));
	if (season?.status === 'archived') throw new ProgramError('archived', 'Archived seasons are read-only.');
	const patch: Partial<{ number: number; name: string }> = {};
	if (input.number !== undefined) {
		if (!Number.isInteger(input.number) || input.number < 1) throw new ProgramError('invalid_region', 'Region number must be a positive integer.');
		patch.number = input.number;
	}
	if (input.name !== undefined) patch.name = input.name.trim();
	if (Object.keys(patch).length === 0) return region;
	try {
		const [updated] = await db.update(schema.regions).set(patch).where(eq(schema.regions.id, input.regionId)).returning();
		return updated;
	} catch {
		throw new ProgramError('duplicate_region', 'Another region already uses that number in this season.');
	}
}

/** State setup policies must be chosen explicitly, never inferred. Both flags are required. */
export async function updateStateSettings(db: Database, input: { contestId: string; topicalIndividualAllowed: boolean; crossSchoolTopicalTeamsAllowed: boolean }) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest) throw new ProgramError('not_found', 'Contest not found.');
	if (contest.kind !== 'state') throw new ProgramError('invalid_request', 'Only the state contest has setup policies.');
	if (typeof input.topicalIndividualAllowed !== 'boolean' || typeof input.crossSchoolTopicalTeamsAllowed !== 'boolean') {
		throw new ProgramError('invalid_settings', 'State contest policies must be chosen explicitly.');
	}
	const [updated] = await db.update(schema.contests).set({
		settingsJson: JSON.stringify({ topicalIndividualAllowed: input.topicalIndividualAllowed, crossSchoolTopicalTeamsAllowed: input.crossSchoolTopicalTeamsAllowed }),
		updatedAt: Date.now(),
	}).where(eq(schema.contests.id, input.contestId)).returning();
	return updated;
}

export async function updateContestMeta(db: Database, input: { contestId: string; name?: string; startsAt?: number | null }) {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
	if (!contest) throw new ProgramError('not_found', 'Contest not found.');
	if (contest.lifecycle === 'finalized') throw new ProgramError('finalized', 'Finalized contests are read-only. Reopen them from the Scoring page to make a correction.');
	const patch: Partial<{ name: string; startsAt: number | null; updatedAt: number }> = { updatedAt: Date.now() };
	if (input.name !== undefined) patch.name = requiredName(input.name, 'Contest name');
	if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
	const [updated] = await db.update(schema.contests).set(patch).where(eq(schema.contests.id, input.contestId)).returning();
	return updated;
}

export async function createContest(db: Database, input: { seasonId: string; kind: 'regional' | 'state'; regionId?: string; name: string; startsAt?: number | null; stateSettings?: StateContestSettings; now?: number }) {
	const name = requiredName(input.name, 'Contest name');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, input.seasonId));
	if (!season) throw new ProgramError('not_found', 'Season not found.');
	if (season.status === 'archived') throw new ProgramError('archived', 'Archived seasons are read-only.');
	if (input.kind === 'state' && input.regionId) throw new ProgramError('invalid_region', 'State contests cannot belong to a region.');
	if (input.kind === 'regional' && !input.regionId) throw new ProgramError('invalid_region', 'Regional contests require a region.');
	if (input.kind === 'state' && !input.stateSettings) throw new ProgramError('invalid_settings', 'State contest policies must be chosen explicitly.');
	if (input.regionId) {
		const [region] = await db.select().from(schema.regions).where(and(eq(schema.regions.id, input.regionId), eq(schema.regions.seasonId, input.seasonId)));
		if (!region) throw new ProgramError('invalid_region', 'Region does not belong to this season.');
	}
	const now = input.now ?? Date.now();
	const [contest] = await db.insert(schema.contests).values({
		id: crypto.randomUUID(), seasonId: input.seasonId, regionId: input.regionId ?? null, kind: input.kind,
		name, startsAt: input.startsAt ?? null, settingsJson: JSON.stringify(input.stateSettings ?? {}), lifecycle: 'setup', createdAt: now, updatedAt: now,
	}).returning();
	return contest;
}

export async function setContestLifecycle(db: Database, contestId: string, seasonId: string, lifecycle: ContestLifecycle, now = Date.now()): Promise<void> {
	if (lifecycle === 'finalized') {
		throw new ProgramError('scoring_required', 'Finalize results from the Scoring page after reviewing completeness. Publish results there as a separate step.');
	}
	const [contest] = await db.select().from(schema.contests).where(and(eq(schema.contests.id, contestId), eq(schema.contests.seasonId, seasonId)));
	if (!contest) throw new ProgramError('not_found', 'Contest not found.');
	if (contest.lifecycle === 'finalized') throw new ProgramError('finalized', 'Finalized contests are read-only. Reopen them from the Scoring page to make a correction.');
	if (lifecycleOrder.indexOf(lifecycle) < lifecycleOrder.indexOf(contest.lifecycle as ContestLifecycle)) {
		throw new ProgramError('invalid_transition', 'Contest lifecycle cannot move backward.');
	}
	await db.update(schema.contests).set({ lifecycle, updatedAt: now }).where(eq(schema.contests.id, contestId));
}
