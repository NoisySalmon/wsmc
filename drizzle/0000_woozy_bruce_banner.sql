CREATE TABLE `contests` (
	`id` text PRIMARY KEY NOT NULL,
	`region` integer NOT NULL,
	`year` integer NOT NULL,
	`name` text NOT NULL,
	`contest_chair` text DEFAULT '' NOT NULL,
	`regional_director` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'setup' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `knowdown_results` (
	`contest_id` text NOT NULL,
	`place` integer NOT NULL,
	`student_id` text NOT NULL,
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowdown_contest_place` ON `knowdown_results` (`contest_id`,`place`);--> statement-breakpoint
CREATE TABLE `project_scores` (
	`team_id` text PRIMARY KEY NOT NULL,
	`score` real NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`contest_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text DEFAULT '' NOT NULL,
	`division` integer NOT NULL,
	`coach_name` text DEFAULT '' NOT NULL,
	`coach_email` text DEFAULT '' NOT NULL,
	`coach_phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`city_zip` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`contest_id`) REFERENCES `contests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`name` text NOT NULL,
	`actual_grade` integer NOT NULL,
	`competing_grade` integer NOT NULL,
	`is_knowdown` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_id` text NOT NULL,
	`student_id` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_pk` ON `team_members` (`team_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `team_problem_scores` (
	`team_id` text PRIMARY KEY NOT NULL,
	`score` real NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`contest_type` text NOT NULL,
	`team_number` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_school_type_number` ON `teams` (`school_id`,`contest_type`,`team_number`);--> statement-breakpoint
CREATE TABLE `topical_individual_scores` (
	`student_id` text PRIMARY KEY NOT NULL,
	`part1` real NOT NULL,
	`part2` real NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `topical_team_scores` (
	`team_id` text PRIMARY KEY NOT NULL,
	`part1` real NOT NULL,
	`part2` real NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`school_id` text,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);