import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Helper for UUID default
const uuid = () => sql`(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`;

// ── Contest ──────────────────────────────────────────────
export const contests = sqliteTable('contests', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	region: integer('region').notNull(),
	year: integer('year').notNull(),
	name: text('name').notNull(),
	contestChair: text('contest_chair').notNull().default(''),
	regionalDirector: text('regional_director').notNull().default(''),
	status: text('status', { enum: ['setup', 'active', 'scoring', 'finalized'] }).notNull().default('setup'),
});

// ── School ───────────────────────────────────────────────
export const schools = sqliteTable('schools', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	contestId: text('contest_id').notNull().references(() => contests.id),
	name: text('name').notNull(),
	shortName: text('short_name').notNull().default(''),
	division: integer('division').notNull(), // 1 or 2
	coachName: text('coach_name').notNull().default(''),
	coachEmail: text('coach_email').notNull().default(''),
	coachPhone: text('coach_phone').notNull().default(''),
	address: text('address').notNull().default(''),
	cityZip: text('city_zip').notNull().default(''),
});

// ── Student ──────────────────────────────────────────────
export const students = sqliteTable('students', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	schoolId: text('school_id').notNull().references(() => schools.id),
	name: text('name').notNull(),
	actualGrade: integer('actual_grade').notNull(), // 9, 10, 11, 12
	competingGrade: integer('competing_grade').notNull(), // >= actual_grade
	isKnowdown: integer('is_knowdown', { mode: 'boolean' }).notNull().default(false),
});

// ── Team ─────────────────────────────────────────────────
export const teams = sqliteTable('teams', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	schoolId: text('school_id').notNull().references(() => schools.id),
	contestType: text('contest_type', { enum: ['project', 'team_problem', 'topical'] }).notNull(),
	teamNumber: integer('team_number').notNull(), // 1-based
}, (table) => [
	uniqueIndex('teams_school_type_number').on(table.schoolId, table.contestType, table.teamNumber),
]);

// ── TeamMember ───────────────────────────────────────────
export const teamMembers = sqliteTable('team_members', {
	teamId: text('team_id').notNull().references(() => teams.id),
	studentId: text('student_id').notNull().references(() => students.id),
}, (table) => [
	uniqueIndex('team_members_pk').on(table.teamId, table.studentId),
]);

// ── ProjectScore ─────────────────────────────────────────
export const projectScores = sqliteTable('project_scores', {
	teamId: text('team_id').primaryKey().references(() => teams.id),
	score: real('score').notNull(),
});

// ── TeamProblemScore ─────────────────────────────────────
export const teamProblemScores = sqliteTable('team_problem_scores', {
	teamId: text('team_id').primaryKey().references(() => teams.id),
	score: real('score').notNull(),
});

// ── TopicalTeamScore ─────────────────────────────────────
export const topicalTeamScores = sqliteTable('topical_team_scores', {
	teamId: text('team_id').primaryKey().references(() => teams.id),
	part1: real('part1').notNull(),
	part2: real('part2').notNull(),
});

// ── TopicalIndividualScore ───────────────────────────────
export const topicalIndividualScores = sqliteTable('topical_individual_scores', {
	studentId: text('student_id').primaryKey().references(() => students.id),
	part1: real('part1').notNull(),
	part2: real('part2').notNull(),
});

// ── KnowdownResult ───────────────────────────────────────
export const knowdownResults = sqliteTable('knowdown_results', {
	contestId: text('contest_id').notNull().references(() => contests.id),
	place: integer('place').notNull(), // 1, 2, 3, 4
	studentId: text('student_id').notNull().references(() => students.id),
}, (table) => [
	uniqueIndex('knowdown_contest_place').on(table.contestId, table.place),
]);

// ── Users (for auth in milestone 6) ─────────────────────
export const users = sqliteTable('users', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['coordinator', 'coach'] }).notNull(),
	schoolId: text('school_id').references(() => schools.id), // null for coordinators
});
