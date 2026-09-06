/**
 * Temporary compatibility schema for the unauthenticated prototype routes.
 * These tables are removed by the v2 reset migration and must not be used by
 * new application code. The routes will be replaced during Phases 2–4.
 */
import { drizzle } from 'drizzle-orm/d1';
import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const schema = {
	contests: sqliteTable('contests', {
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		region: integer('region').notNull(),
		year: integer('year').notNull(),
		name: text('name').notNull(),
		contestChair: text('contest_chair').notNull().default(''),
		regionalDirector: text('regional_director').notNull().default(''),
		status: text('status', { enum: ['setup', 'active', 'scoring', 'finalized'] }).notNull().default('setup'),
	}),
	schools: sqliteTable('schools', {
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		contestId: text('contest_id').notNull(),
		name: text('name').notNull(),
		shortName: text('short_name').notNull().default(''),
		division: integer('division').notNull(),
		coachName: text('coach_name').notNull().default(''),
		coachEmail: text('coach_email').notNull().default(''),
		coachPhone: text('coach_phone').notNull().default(''),
		address: text('address').notNull().default(''),
		cityZip: text('city_zip').notNull().default(''),
	}),
	students: sqliteTable('students', {
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		schoolId: text('school_id').notNull(),
		name: text('name').notNull(),
		actualGrade: integer('actual_grade').notNull(),
		competingGrade: integer('competing_grade').notNull(),
		isKnowdown: integer('is_knowdown', { mode: 'boolean' }).notNull().default(false),
	}),
	teams: sqliteTable('teams', {
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		schoolId: text('school_id').notNull(),
		contestType: text('contest_type', { enum: ['project', 'team_problem', 'topical'] }).notNull(),
		teamNumber: integer('team_number').notNull(),
	}, (table) => [uniqueIndex('legacy_teams_school_type_number').on(table.schoolId, table.contestType, table.teamNumber)]),
	teamMembers: sqliteTable('team_members', {
		teamId: text('team_id').notNull(),
		studentId: text('student_id').notNull(),
	}, (table) => [uniqueIndex('legacy_team_members_pk').on(table.teamId, table.studentId)]),
	projectScores: sqliteTable('project_scores', {
		teamId: text('team_id').primaryKey(),
		score: real('score').notNull(),
	}),
	teamProblemScores: sqliteTable('team_problem_scores', {
		teamId: text('team_id').primaryKey(),
		score: real('score').notNull(),
	}),
	topicalTeamScores: sqliteTable('topical_team_scores', {
		teamId: text('team_id').primaryKey(),
		part1: real('part1').notNull(),
		part2: real('part2').notNull(),
	}),
	topicalIndividualScores: sqliteTable('topical_individual_scores', {
		studentId: text('student_id').primaryKey(),
		part1: real('part1').notNull(),
		part2: real('part2').notNull(),
	}),
	knowdownResults: sqliteTable('knowdown_results', {
		contestId: text('contest_id').notNull(),
		place: integer('place').notNull(),
		studentId: text('student_id').notNull(),
	}, (table) => [uniqueIndex('legacy_knowdown_contest_place').on(table.contestId, table.place)]),
	users: sqliteTable('users', {
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		email: text('email').notNull().unique(),
		passwordHash: text('password_hash').notNull(),
		role: text('role', { enum: ['coordinator', 'coach'] }).notNull(),
		schoolId: text('school_id'),
	}),
};

export function getDb(d1: D1Database) {
	return drizzle(d1, { schema });
}
