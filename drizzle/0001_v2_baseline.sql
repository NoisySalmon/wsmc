-- Custom SQL migration file, put your code below! --
-- The prototype database is disposable. This migration resets the original
-- single-contest tables and creates the normalized statewide v2 foundation.
PRAGMA foreign_keys = OFF;
--> statement-breakpoint
DROP TABLE IF EXISTS knowdown_results;
--> statement-breakpoint
DROP TABLE IF EXISTS topical_individual_scores;
--> statement-breakpoint
DROP TABLE IF EXISTS topical_team_scores;
--> statement-breakpoint
DROP TABLE IF EXISTS team_problem_scores;
--> statement-breakpoint
DROP TABLE IF EXISTS project_scores;
--> statement-breakpoint
DROP TABLE IF EXISTS team_members;
--> statement-breakpoint
DROP TABLE IF EXISTS teams;
--> statement-breakpoint
DROP TABLE IF EXISTS students;
--> statement-breakpoint
DROP TABLE IF EXISTS users;
--> statement-breakpoint
DROP TABLE IF EXISTS schools;
--> statement-breakpoint
DROP TABLE IF EXISTS contests;
--> statement-breakpoint
PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `annual_students` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`school_id` text NOT NULL,
	`name` text NOT NULL,
	`actual_grade` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "annual_students_grade_check" CHECK("annual_students"."actual_grade" IN (9, 10, 11, 12))
);
--> statement-breakpoint
CREATE INDEX `annual_students_season_school_idx` ON `annual_students` (`season_id`,`school_id`);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`contest_id` text,
	`school_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_contest_created_idx` ON `audit_events` (`contest_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);
--> statement-breakpoint
CREATE TABLE `coach_assignments` (
	`user_id` text NOT NULL,
	`season_id` text NOT NULL,
	`school_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `season_id`, `school_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `coach_assignments_school_idx` ON `coach_assignments` (`school_id`);
--> statement-breakpoint
CREATE TABLE `contest_roster_members` (
	`contest_id` text NOT NULL,
	`participation_id` text NOT NULL,
	`annual_student_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`contest_id`, `annual_student_id`),
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participation_id`) REFERENCES `school_participations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participation_id`, `contest_id`) REFERENCES `school_participations`(`id`, `contest_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`annual_student_id`) REFERENCES `annual_students`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `contest_roster_participation_idx` ON `contest_roster_members` (`participation_id`);
--> statement-breakpoint
CREATE TABLE `contests` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`region_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`starts_at` integer,
	`lifecycle` text DEFAULT 'setup' NOT NULL,
	`results_published_at` integer,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "contests_kind_check" CHECK("contests"."kind" IN ('regional', 'state')),
	CONSTRAINT "contests_lifecycle_check" CHECK("contests"."lifecycle" IN ('setup', 'registration_open', 'roster_locked', 'scoring', 'finalized')),
	CONSTRAINT "contests_state_region_check" CHECK(("contests"."kind" = 'state' AND "contests"."region_id" IS NULL) OR ("contests"."kind" = 'regional' AND "contests"."region_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contests_season_region_kind_uq` ON `contests` (`season_id`,`region_id`,`kind`);
--> statement-breakpoint
CREATE UNIQUE INDEX `contests_season_state_uq` ON `contests` (`season_id`) WHERE `kind` = 'state';
--> statement-breakpoint
CREATE INDEX `contests_season_lifecycle_idx` ON `contests` (`season_id`,`lifecycle`);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`contest_id` text NOT NULL,
	`owner_school_id` text,
	`category` text NOT NULL,
	`entry_kind` text NOT NULL,
	`entry_number` integer,
	`division` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entries_division_check" CHECK("entries"."division" IN (1, 2)),
	CONSTRAINT "entries_category_check" CHECK("entries"."category" IN ('project', 'team_contest', 'topical_team', 'topical_individual', 'knowdown')),
	CONSTRAINT "entries_kind_check" CHECK("entries"."entry_kind" IN ('team', 'individual'))
);
--> statement-breakpoint
CREATE INDEX `entries_contest_category_division_idx` ON `entries` (`contest_id`,`category`,`division`);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_contest_category_owner_number_uq` ON `entries` (`contest_id`,`category`,`owner_school_id`,`entry_number`);
--> statement-breakpoint
CREATE TABLE `entry_members` (
	`entry_id` text NOT NULL,
	`annual_student_id` text NOT NULL,
	`competing_grade` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`entry_id`, `annual_student_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`annual_student_id`) REFERENCES `annual_students`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entry_members_grade_check" CHECK("entry_members"."competing_grade" IS NULL OR "entry_members"."competing_grade" IN (9, 10, 11, 12))
);
--> statement-breakpoint
CREATE INDEX `entry_members_student_idx` ON `entry_members` (`annual_student_id`);
--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`contest_id` text NOT NULL,
	`school_id` text,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `qualification_reasons` (
	`id` text PRIMARY KEY NOT NULL,
	`qualification_id` text NOT NULL,
	`kind` text NOT NULL,
	`rank` integer,
	`scope` text,
	`actual_grade` integer,
	`threshold` real,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`qualification_id`) REFERENCES `qualifications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `qualification_reasons_qualification_idx` ON `qualification_reasons` (`qualification_id`);
--> statement-breakpoint
CREATE TABLE `qualification_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`thresholds_json` text DEFAULT '{}' NOT NULL,
	`published_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `qualification_rounds_season_status_idx` ON `qualification_rounds` (`season_id`,`status`);
--> statement-breakpoint
CREATE TABLE `qualifications` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`season_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`student_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `qualification_rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`student_id`) REFERENCES `annual_students`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `qualifications_season_student_idx` ON `qualifications` (`season_id`,`student_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `qualifications_round_entry_uq` ON `qualifications` (`round_id`,`entry_id`);
--> statement-breakpoint
CREATE TABLE `regional_coordinator_assignments` (
	`user_id` text NOT NULL,
	`contest_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `contest_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `regional_assignments_contest_idx` ON `regional_coordinator_assignments` (`contest_id`);
--> statement-breakpoint
CREATE TABLE `regions` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`number` integer NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "regions_number_check" CHECK("regions"."number" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `regions_season_number_uq` ON `regions` (`season_id`,`number`);
--> statement-breakpoint
CREATE TABLE `results` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`score` real,
	`part1` real,
	`part2` real,
	`placement` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`last_edited_by` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_edited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "results_nonnegative_check" CHECK(("results"."score" IS NULL OR "results"."score" >= 0) AND ("results"."part1" IS NULL OR "results"."part1" BETWEEN 0 AND 75) AND ("results"."part2" IS NULL OR "results"."part2" BETWEEN 0 AND 75) AND ("results"."placement" IS NULL OR "results"."placement" BETWEEN 1 AND 4))
);
--> statement-breakpoint
CREATE TABLE `school_participations` (
	`id` text PRIMARY KEY NOT NULL,
	`contest_id` text NOT NULL,
	`school_id` text NOT NULL,
	`division` integer NOT NULL,
	`invitation_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "school_participations_division_check" CHECK("school_participations"."division" IN (1, 2)),
	CONSTRAINT "school_participations_invitation_status_check" CHECK("school_participations"."invitation_status" IN ('pending', 'invited', 'accepted', 'declined'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_participations_contest_school_uq` ON `school_participations` (`contest_id`,`school_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_participations_id_contest_uq` ON `school_participations` (`id`,`contest_id`);
--> statement-breakpoint
CREATE INDEX `school_participations_contest_division_idx` ON `school_participations` (`contest_id`,`division`);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'WA' NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schools_name_idx` ON `schools` (`name`);
--> statement-breakpoint
CREATE INDEX `schools_active_idx` ON `schools` (`active`);
--> statement-breakpoint
CREATE TABLE `scorekeeper_assignments` (
	`user_id` text NOT NULL,
	`contest_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `contest_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'setup' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "seasons_year_check" CHECK("seasons"."year" >= 2000 AND "seasons"."year" <= 2200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_year_unique` ON `seasons` (`year`);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sessions_expiry_check" CHECK("sessions"."expires_at" > "sessions"."created_at")
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `sign_in_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sign_in_tokens_expiry_check" CHECK("sign_in_tokens"."expires_at" > "sign_in_tokens"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sign_in_tokens_token_hash_unique` ON `sign_in_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `sign_in_tokens_user_idx` ON `sign_in_tokens` (`user_id`);
--> statement-breakpoint
CREATE TABLE `state_attendances` (
	`contest_id` text NOT NULL,
	`school_id` text NOT NULL,
	`intent` text DEFAULT 'undecided' NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`contest_id`, `school_id`),
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `state_roster_members` (
	`contest_id` text NOT NULL,
	`school_id` text NOT NULL,
	`annual_student_id` text NOT NULL,
	`admission_basis` text NOT NULL,
	`qualification_id` text,
	`state_entry_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`contest_id`, `annual_student_id`),
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`annual_student_id`) REFERENCES `annual_students`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`qualification_id`) REFERENCES `qualifications`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`state_entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `state_roster_school_idx` ON `state_roster_members` (`contest_id`,`school_id`);
--> statement-breakpoint
CREATE TABLE `state_team_berths` (
	`id` text PRIMARY KEY NOT NULL,
	`qualification_id` text NOT NULL,
	`state_entry_id` text,
	`school_id` text NOT NULL,
	`category` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`qualification_id`) REFERENCES `qualifications`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`state_entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `state_team_berths_qualification_id_unique` ON `state_team_berths` (`qualification_id`);
--> statement-breakpoint
CREATE TABLE `statewide_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`season_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statewide_assignments_system_user_uq` ON `statewide_assignments` (`user_id`) WHERE `season_id` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `statewide_assignments_season_user_uq` ON `statewide_assignments` (`user_id`,`season_id`) WHERE `season_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `statewide_assignments_season_idx` ON `statewide_assignments` (`season_id`);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);
