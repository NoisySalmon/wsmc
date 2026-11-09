-- Pre-launch access reset: re-seed assignments after applying this migration.
-- Accounts, competition records, historical attribution, and event-specific
-- scorekeeper assignments are preserved.
DROP TABLE statewide_assignments;
--> statement-breakpoint
DROP TABLE regional_coordinator_assignments;
--> statement-breakpoint
DROP TABLE coach_assignments;
--> statement-breakpoint
CREATE TABLE statewide_assignments (
 user_id text PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE TABLE regional_coordinator_assignments (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 region_number integer NOT NULL CONSTRAINT regional_assignments_region_check CHECK (region_number > 0),
 created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
 PRIMARY KEY (user_id, region_number)
);
--> statement-breakpoint
CREATE INDEX regional_assignments_region_idx ON regional_coordinator_assignments (region_number);
--> statement-breakpoint
CREATE TABLE coach_assignments (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
 created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
 PRIMARY KEY (user_id, school_id)
);
--> statement-breakpoint
CREATE INDEX coach_assignments_school_idx ON coach_assignments (school_id);
