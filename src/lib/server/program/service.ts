import { and, eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';

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

export async function createSeason(db: Database, input: { year: number; name: string; now?: number }) {
	if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2200) {
		throw new ProgramError('invalid_year', 'Season year must be between 2000 and 2200.');
	}
	const name = requiredName(input.name, 'Season name');
	const now = input.now ?? Date.now();
	const [season] = await db.insert(schema.seasons).values({
		id: crypto.randomUUID(), year: input.year, name, createdAt: now, updatedAt: now,
	}).returning();
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

export async function setContestLifecycle(db: Database, contestId: string, lifecycle: ContestLifecycle, now = Date.now()): Promise<void> {
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	if (!contest) throw new ProgramError('not_found', 'Contest not found.');
	if (contest.lifecycle === 'finalized' && lifecycle !== 'finalized') throw new ProgramError('finalized', 'Finalized contests are read-only.');
	if (lifecycleOrder.indexOf(lifecycle) < lifecycleOrder.indexOf(contest.lifecycle as ContestLifecycle)) {
		throw new ProgramError('invalid_transition', 'Contest lifecycle cannot move backward.');
	}
	await db.update(schema.contests).set({ lifecycle, updatedAt: now, resultsPublishedAt: lifecycle === 'finalized' ? now : contest.resultsPublishedAt }).where(eq(schema.contests.id, contestId));
}
