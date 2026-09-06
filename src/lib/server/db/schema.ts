import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey, check, foreignKey } from 'drizzle-orm/sqlite-core';

const timestamp = () => sql`(unixepoch() * 1000)`;

// ── Identity ─────────────────────────────────────────────
export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	displayName: text('display_name').notNull().default(''),
	status: text('status', { enum: ['pending', 'active', 'disabled'] }).notNull().default('pending'),
	createdAt: integer('created_at').notNull().default(timestamp()),
	updatedAt: integer('updated_at').notNull().default(timestamp()),
}, (table) => [index('users_status_idx').on(table.status)]);

export const signInTokens = sqliteTable('sign_in_tokens', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	tokenHash: text('token_hash').notNull().unique(),
	purpose: text('purpose', { enum: ['invite', 'sign_in'] }).notNull(),
	expiresAt: integer('expires_at').notNull(),
	usedAt: integer('used_at'),
	revokedAt: integer('revoked_at'),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [index('sign_in_tokens_user_idx').on(table.userId), check('sign_in_tokens_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`)]);

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull(),
	revokedAt: integer('revoked_at'),
	createdAt: integer('created_at').notNull().default(timestamp()),
	lastSeenAt: integer('last_seen_at').notNull().default(timestamp()),
}, (table) => [index('sessions_user_idx').on(table.userId), check('sessions_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`)]);

// ── Program ──────────────────────────────────────────────
export const seasons = sqliteTable('seasons', {
	id: text('id').primaryKey(),
	year: integer('year').notNull().unique(),
	name: text('name').notNull(),
	status: text('status', { enum: ['setup', 'active', 'archived'] }).notNull().default('setup'),
	createdAt: integer('created_at').notNull().default(timestamp()),
	updatedAt: integer('updated_at').notNull().default(timestamp()),
}, (table) => [check('seasons_year_check', sql`${table.year} >= 2000 AND ${table.year} <= 2200`)]);

export const regions = sqliteTable('regions', {
	id: text('id').primaryKey(),
	seasonId: text('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
	number: integer('number').notNull(),
	name: text('name').notNull().default(''),
}, (table) => [uniqueIndex('regions_season_number_uq').on(table.seasonId, table.number), check('regions_number_check', sql`${table.number} > 0`)]);

export const contests = sqliteTable('contests', {
	id: text('id').primaryKey(),
	seasonId: text('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
	regionId: text('region_id').references(() => regions.id, { onDelete: 'cascade' }),
	kind: text('kind', { enum: ['regional', 'state'] }).notNull(),
	name: text('name').notNull(),
	startsAt: integer('starts_at'),
	lifecycle: text('lifecycle', { enum: ['setup', 'registration_open', 'roster_locked', 'scoring', 'finalized'] }).notNull().default('setup'),
	resultsPublishedAt: integer('results_published_at'),
	settingsJson: text('settings_json').notNull().default('{}'),
	createdAt: integer('created_at').notNull().default(timestamp()),
	updatedAt: integer('updated_at').notNull().default(timestamp()),
}, (table) => [
	uniqueIndex('contests_season_region_kind_uq').on(table.seasonId, table.regionId, table.kind),
	uniqueIndex('contests_season_state_uq').on(table.seasonId).where(sql`${table.kind} = 'state'`),
	index('contests_season_lifecycle_idx').on(table.seasonId, table.lifecycle),
	check('contests_kind_check', sql`${table.kind} IN ('regional', 'state')`),
	check('contests_lifecycle_check', sql`${table.lifecycle} IN ('setup', 'registration_open', 'roster_locked', 'scoring', 'finalized')`),
	check('contests_state_region_check', sql`(${table.kind} = 'state' AND ${table.regionId} IS NULL) OR (${table.kind} = 'regional' AND ${table.regionId} IS NOT NULL)`),
]);

// ── Organizations ───────────────────────────────────────
export const schools = sqliteTable('schools', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	shortName: text('short_name').notNull().default(''),
	address: text('address').notNull().default(''),
	city: text('city').notNull().default(''),
	state: text('state').notNull().default('WA'),
	postalCode: text('postal_code').notNull().default(''),
	contactEmail: text('contact_email').notNull().default(''),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull().default(timestamp()),
	updatedAt: integer('updated_at').notNull().default(timestamp()),
}, (table) => [index('schools_name_idx').on(table.name), index('schools_active_idx').on(table.active)]);

// ── Authorization assignments ───────────────────────────
export const statewideAssignments = sqliteTable('statewide_assignments', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	seasonId: text('season_id').references(() => seasons.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [
	uniqueIndex('statewide_assignments_system_user_uq').on(table.userId).where(sql`${table.seasonId} IS NULL`),
	uniqueIndex('statewide_assignments_season_user_uq').on(table.userId, table.seasonId).where(sql`${table.seasonId} IS NOT NULL`),
	index('statewide_assignments_season_idx').on(table.seasonId),
]);

export const regionalCoordinatorAssignments = sqliteTable('regional_coordinator_assignments', {
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	contestId: text('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [primaryKey({ columns: [table.userId, table.contestId] }), index('regional_assignments_contest_idx').on(table.contestId)]);

export const coachAssignments = sqliteTable('coach_assignments', {
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	seasonId: text('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
	schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [primaryKey({ columns: [table.userId, table.seasonId, table.schoolId] }), index('coach_assignments_school_idx').on(table.schoolId)]);

export const scorekeeperAssignments = sqliteTable('scorekeeper_assignments', {
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	contestId: text('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [primaryKey({ columns: [table.userId, table.contestId] })]);

export const schoolParticipations = sqliteTable('school_participations', {
	id: text('id').primaryKey(),
	contestId: text('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
	schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
	division: integer('division').notNull(),
	invitationStatus: text('invitation_status', { enum: ['pending', 'invited', 'accepted', 'declined'] }).notNull().default('pending'),
	createdAt: integer('created_at').notNull().default(timestamp()),
	updatedAt: integer('updated_at').notNull().default(timestamp()),
}, (table) => [uniqueIndex('school_participations_contest_school_uq').on(table.contestId, table.schoolId), uniqueIndex('school_participations_id_contest_uq').on(table.id, table.contestId), index('school_participations_contest_division_idx').on(table.contestId, table.division), check('school_participations_division_check', sql`${table.division} IN (1, 2)`), check('school_participations_invitation_status_check', sql`${table.invitationStatus} IN ('pending', 'invited', 'accepted', 'declined')`)]);

// ── Annual people and contest roster ─────────────────────
export const annualStudents = sqliteTable('annual_students', {
	id: text('id').primaryKey(),
	seasonId: text('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
	schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
	name: text('name').notNull(),
	actualGrade: integer('actual_grade').notNull(),
	createdAt: integer('created_at').notNull().default(timestamp()),
	updatedAt: integer('updated_at').notNull().default(timestamp()),
}, (table) => [index('annual_students_season_school_idx').on(table.seasonId, table.schoolId), check('annual_students_grade_check', sql`${table.actualGrade} IN (9, 10, 11, 12)`)]);

export const contestRosterMembers = sqliteTable('contest_roster_members', {
	contestId: text('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
	participationId: text('participation_id').notNull().references(() => schoolParticipations.id, { onDelete: 'cascade' }),
	annualStudentId: text('annual_student_id').notNull().references(() => annualStudents.id, { onDelete: 'restrict' }),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [
	primaryKey({ columns: [table.contestId, table.annualStudentId] }),
	index('contest_roster_participation_idx').on(table.participationId),
	foreignKey({ columns: [table.participationId, table.contestId], foreignColumns: [schoolParticipations.id, schoolParticipations.contestId], name: 'contest_roster_participation_contest_fk' }),
]);

// ── Competition ──────────────────────────────────────────
export const entries = sqliteTable('entries', {
	id: text('id').primaryKey(),
	contestId: text('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
	ownerSchoolId: text('owner_school_id').references(() => schools.id, { onDelete: 'restrict' }),
	category: text('category', { enum: ['project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown'] }).notNull(),
	entryKind: text('entry_kind', { enum: ['team', 'individual'] }).notNull(),
	entryNumber: integer('entry_number'),
	division: integer('division').notNull(),
	createdAt: integer('created_at').notNull().default(timestamp()),
	updatedAt: integer('updated_at').notNull().default(timestamp()),
}, (table) => [index('entries_contest_category_division_idx').on(table.contestId, table.category, table.division), uniqueIndex('entries_contest_category_owner_number_uq').on(table.contestId, table.category, table.ownerSchoolId, table.entryNumber), check('entries_division_check', sql`${table.division} IN (1, 2)`), check('entries_category_check', sql`${table.category} IN ('project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown')`), check('entries_kind_check', sql`${table.entryKind} IN ('team', 'individual')`)]);

export const entryMembers = sqliteTable('entry_members', {
	entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
	annualStudentId: text('annual_student_id').notNull().references(() => annualStudents.id, { onDelete: 'restrict' }),
	competingGrade: integer('competing_grade'),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [primaryKey({ columns: [table.entryId, table.annualStudentId] }), index('entry_members_student_idx').on(table.annualStudentId), check('entry_members_grade_check', sql`${table.competingGrade} IS NULL OR ${table.competingGrade} IN (9, 10, 11, 12)`)]);

export const results = sqliteTable('results', {
	entryId: text('entry_id').primaryKey().references(() => entries.id, { onDelete: 'cascade' }),
	score: real('score'),
	part1: real('part1'),
	part2: real('part2'),
	placement: integer('placement'),
	version: integer('version').notNull().default(1),
	lastEditedBy: text('last_edited_by').references(() => users.id, { onDelete: 'set null' }),
	updatedAt: integer('updated_at').notNull().default(timestamp()),
}, (table) => [check('results_nonnegative_check', sql`(${table.score} IS NULL OR ${table.score} >= 0) AND (${table.part1} IS NULL OR ${table.part1} BETWEEN 0 AND 75) AND (${table.part2} IS NULL OR ${table.part2} BETWEEN 0 AND 75) AND (${table.placement} IS NULL OR ${table.placement} BETWEEN 1 AND 4)`)]);

// ── Qualification and state ──────────────────────────────
export const qualificationRounds = sqliteTable('qualification_rounds', {
	id: text('id').primaryKey(),
	seasonId: text('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
	kind: text('kind', { enum: ['regional_placements', 'state_cutoff', 'manual_review'] }).notNull(),
	status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
	thresholdsJson: text('thresholds_json').notNull().default('{}'),
	publishedAt: integer('published_at'),
	createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [index('qualification_rounds_season_status_idx').on(table.seasonId, table.status)]);

export const qualifications = sqliteTable('qualifications', {
	id: text('id').primaryKey(),
	roundId: text('round_id').notNull().references(() => qualificationRounds.id, { onDelete: 'cascade' }),
	seasonId: text('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
	entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'restrict' }),
	studentId: text('student_id').references(() => annualStudents.id, { onDelete: 'restrict' }),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [index('qualifications_season_student_idx').on(table.seasonId, table.studentId), uniqueIndex('qualifications_round_entry_uq').on(table.roundId, table.entryId)]);

export const qualificationReasons = sqliteTable('qualification_reasons', {
	id: text('id').primaryKey(),
	qualificationId: text('qualification_id').notNull().references(() => qualifications.id, { onDelete: 'cascade' }),
	kind: text('kind', { enum: ['regional_placement', 'state_cutoff', 'manual_include', 'manual_exclude', 'knowdown_alternate'] }).notNull(),
	rank: integer('rank'),
	scope: text('scope', { enum: ['overall', 'actual_grade'] }),
	actualGrade: integer('actual_grade'),
	threshold: real('threshold'),
	detailJson: text('detail_json').notNull().default('{}'),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [index('qualification_reasons_qualification_idx').on(table.qualificationId)]);

export const stateAttendances = sqliteTable('state_attendances', {
	contestId: text('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
	schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
	intent: text('intent', { enum: ['undecided', 'attending', 'not_attending'] }).notNull().default('undecided'),
	updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
	updatedAt: integer('updated_at').notNull().default(timestamp()),
}, (table) => [primaryKey({ columns: [table.contestId, table.schoolId] })]);

export const stateTeamBerths = sqliteTable('state_team_berths', {
	id: text('id').primaryKey(),
	qualificationId: text('qualification_id').notNull().unique().references(() => qualifications.id, { onDelete: 'restrict' }),
	stateEntryId: text('state_entry_id').references(() => entries.id, { onDelete: 'set null' }),
	schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
	category: text('category', { enum: ['project', 'team_contest', 'topical_team'] }).notNull(),
	createdAt: integer('created_at').notNull().default(timestamp()),
});

export const stateRosterMembers = sqliteTable('state_roster_members', {
	contestId: text('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
	schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
	annualStudentId: text('annual_student_id').notNull().references(() => annualStudents.id, { onDelete: 'restrict' }),
	admissionBasis: text('admission_basis', { enum: ['individual_qualification', 'team_berth'] }).notNull(),
	qualificationId: text('qualification_id').references(() => qualifications.id, { onDelete: 'set null' }),
	stateEntryId: text('state_entry_id').references(() => entries.id, { onDelete: 'set null' }),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [primaryKey({ columns: [table.contestId, table.annualStudentId] }), index('state_roster_school_idx').on(table.contestId, table.schoolId)]);

// ── Operations ────────────────────────────────────────────
export const imports = sqliteTable('imports', {
	id: text('id').primaryKey(),
	contestId: text('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
	schoolId: text('school_id').references(() => schools.id, { onDelete: 'restrict' }),
	kind: text('kind', { enum: ['roster', 'score'] }).notNull(),
	filename: text('filename').notNull(),
	status: text('status', { enum: ['preview', 'committed', 'rejected'] }).notNull(),
	createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
	createdAt: integer('created_at').notNull().default(timestamp()),
});

export const auditEvents = sqliteTable('audit_events', {
	id: text('id').primaryKey(),
	actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
	contestId: text('contest_id').references(() => contests.id, { onDelete: 'set null' }),
	schoolId: text('school_id').references(() => schools.id, { onDelete: 'set null' }),
	entityType: text('entity_type').notNull(),
	entityId: text('entity_id').notNull(),
	action: text('action').notNull(),
	detailsJson: text('details_json').notNull().default('{}'),
	createdAt: integer('created_at').notNull().default(timestamp()),
}, (table) => [index('audit_events_contest_created_idx').on(table.contestId, table.createdAt), index('audit_events_entity_idx').on(table.entityType, table.entityId)]);
