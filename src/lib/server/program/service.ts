import { and, eq, ne, sql } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { schema } from '$lib/server/db';
import { defaultRegions } from './default-regions';

export type ContestLifecycle = 'setup' | 'registration_open' | 'roster_locked' | 'scoring' | 'finalized';
export type SeasonStatus = 'regional' | 'qualifications' | 'state' | 'archived';
const seasonOrder: SeasonStatus[] = ['regional', 'qualifications', 'state', 'archived'];
const lifecycleOrder: ContestLifecycle[] = ['setup', 'registration_open', 'roster_locked', 'scoring', 'finalized'];

export class ProgramError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message);
		this.name = 'ProgramError';
	}
}

export async function createSeason(db: Database, input: { year: number; now?: number }) {
	if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2200) {
		throw new ProgramError('invalid_year', 'Season year must be between 2000 and 2200.');
	}
	const existing = await db.select().from(schema.seasons).where(ne(schema.seasons.status, 'archived'));
	if (existing.length) throw new ProgramError('active_season', 'Archive the current season before creating another.');
	const now = input.now ?? Date.now();
	const seasonId = crypto.randomUUID();
	const regions = defaultRegions.map((region) => ({ ...region, id: crypto.randomUUID(), seasonId }));
	const priorSeasonId = sql`(SELECT id FROM seasons WHERE year < ${input.year} ORDER BY year DESC LIMIT 1)`;
	const placements = await db.select({ schoolId: schema.schools.id, division: schema.schools.division, regionNumber: schema.regions.number })
		.from(schema.schoolParticipations)
		.innerJoin(schema.contests, eq(schema.contests.id, schema.schoolParticipations.contestId))
		.innerJoin(schema.regions, eq(schema.regions.id, schema.contests.regionId))
		.innerJoin(schema.schools, eq(schema.schools.id, schema.schoolParticipations.schoolId))
		.where(and(
			eq(schema.contests.kind, 'regional'), eq(schema.schools.active, true),
			eq(schema.contests.seasonId, priorSeasonId),
		));
	const coordinators = await db.select({ userId: schema.users.id, regionNumber: schema.regions.number })
		.from(schema.regionalCoordinatorAssignments)
		.innerJoin(schema.users, eq(schema.users.id, schema.regionalCoordinatorAssignments.userId))
		.innerJoin(schema.contests, eq(schema.contests.id, schema.regionalCoordinatorAssignments.contestId))
		.innerJoin(schema.regions, eq(schema.regions.id, schema.contests.regionId))
		.where(and(eq(schema.contests.seasonId, priorSeasonId), eq(schema.contests.kind, 'regional'), eq(schema.users.status, 'active')));
	const coaches = await db.select({ userId: schema.users.id, schoolId: schema.schools.id })
		.from(schema.coachAssignments)
		.innerJoin(schema.users, eq(schema.users.id, schema.coachAssignments.userId))
		.innerJoin(schema.schools, eq(schema.schools.id, schema.coachAssignments.schoolId))
		.where(and(eq(schema.coachAssignments.seasonId, priorSeasonId), eq(schema.users.status, 'active'), eq(schema.schools.active, true)));
	const regionalContests = regions.map(region => ({
		id: crypto.randomUUID(), seasonId, regionId: region.id, kind: 'regional' as const,
		name: `Region ${region.number} — ${region.name}`, startsAt: null,
		lifecycle: 'setup' as const, createdAt: now, updatedAt: now,
	}));
	const contestForRegion = (number: number) => {
		const region = regions.find(region => region.number === number);
		if (!region) throw new ProgramError('invalid_region', 'A prior assignment has an unknown region.');
		return regionalContests.find(contest => contest.regionId === region.id)!.id;
	};
	const participations = placements.map(placement => ({
		id: crypto.randomUUID(), contestId: contestForRegion(placement.regionNumber),
		schoolId: placement.schoolId, division: placement.division, invitationStatus: 'invited' as const, createdAt: now, updatedAt: now,
	}));
	const coordinatorAssignments = coordinators.map(coordinator => ({
		userId: coordinator.userId, contestId: contestForRegion(coordinator.regionNumber), createdAt: now,
	}));
	// D1 batches are atomic: a failed default cannot leave a partially created season.
	const [[season]] = await db.batch([
		db.insert(schema.seasons).values({
			id: seasonId, year: input.year, status: 'regional', createdAt: now, updatedAt: now,
		}).returning(),
		db.insert(schema.regions).values(regions),
		// Keep individual statements below D1's bound-parameter limit.
		...regionalContests.map(contest => db.insert(schema.contests).values(contest)),
		db.insert(schema.contests).values({ id: crypto.randomUUID(), seasonId, regionId: null, kind: 'state', name: `${input.year} State Contest`, startsAt: null, lifecycle: 'setup', createdAt: now, updatedAt: now }),
		...participations.map(participation => db.insert(schema.schoolParticipations).values(participation)),
		...coordinatorAssignments.map(assignment => db.insert(schema.regionalCoordinatorAssignments).values(assignment)),
		...coaches.map(coach => db.insert(schema.coachAssignments).values({ ...coach, seasonId, createdAt: now })),
	]);
	return season;
}

export async function setSeasonStatus(db: Database, seasonId: string, status: SeasonStatus, now = Date.now()): Promise<void> {
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, seasonId));
	if (!season) throw new ProgramError('not_found', 'Season not found.');
	if (season.status === 'archived') throw new ProgramError('archived', 'Archived seasons are permanently read-only.');
	if (seasonOrder.indexOf(status) !== seasonOrder.indexOf(season.status) + 1) throw new ProgramError('invalid_transition', 'Use the next available season stage.');
	if (status === 'qualifications') {
		const contests = await db.select().from(schema.contests).where(and(eq(schema.contests.seasonId, seasonId), eq(schema.contests.kind, 'regional')));
		if (!contests.length || contests.some((contest) => contest.lifecycle !== 'finalized')) throw new ProgramError('incomplete', 'Finalize all regional contests before attending to qualifications.');
	}
	await db.update(schema.seasons).set({ status, updatedAt: now }).where(eq(schema.seasons.id, seasonId));
}

export async function updateContestDate(db: Database, contestId: string, date: string) {
	if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new ProgramError('invalid_date', 'Enter a valid contest date.');
	const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, contestId));
	if (!contest) throw new ProgramError('not_found', 'Contest not found.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	if (season?.status === 'archived') throw new ProgramError('archived', 'Archived seasons are read-only.');
	if (contest.lifecycle === 'finalized') throw new ProgramError('finalized', 'Finalized contests are read-only. Reopen them from the Scoring page to make a correction.');
	const timeOfDay = contest.startsAt == null ? 0 : ((contest.startsAt % 86_400_000) + 86_400_000) % 86_400_000;
	const [updated] = await db.update(schema.contests).set({ startsAt: date ? Date.parse(date) + timeOfDay : null, updatedAt: Date.now() }).where(eq(schema.contests.id, contestId)).returning();
	return updated;
}

export async function setContestLifecycle(db: Database, contestId: string, seasonId: string, lifecycle: ContestLifecycle, now = Date.now()): Promise<void> {
	if (lifecycle === 'finalized') {
		throw new ProgramError('scoring_required', 'Finalize results from the Scoring page after reviewing completeness. Publish results there as a separate step.');
	}
	const [contest] = await db.select().from(schema.contests).where(and(eq(schema.contests.id, contestId), eq(schema.contests.seasonId, seasonId)));
	if (!contest) throw new ProgramError('not_found', 'Contest not found.');
	const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId));
	if (season?.status === 'archived') throw new ProgramError('archived', 'Archived seasons are read-only.');
	if (contest.lifecycle === 'finalized') throw new ProgramError('finalized', 'Finalized contests are read-only. Reopen them from the Scoring page to make a correction.');
	if (lifecycleOrder.indexOf(lifecycle) < lifecycleOrder.indexOf(contest.lifecycle as ContestLifecycle)) {
		throw new ProgramError('invalid_transition', 'Contest lifecycle cannot move backward.');
	}
	await db.update(schema.contests).set({ lifecycle, updatedAt: now }).where(eq(schema.contests.id, contestId));
}
