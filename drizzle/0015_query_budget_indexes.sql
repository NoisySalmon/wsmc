-- D1 bills rows read, and SQLite scans a child table on every parent delete when the
-- referencing column has no index. These cover the foreign keys and filters that the
-- registration, state and per-request session queries were scanning.
CREATE INDEX entries_owner_contest_idx ON entries (owner_school_id, contest_id);
--> statement-breakpoint
CREATE INDEX qualifications_entry_idx ON qualifications (entry_id);
--> statement-breakpoint
CREATE INDEX state_team_berths_state_entry_idx ON state_team_berths (state_entry_id);
--> statement-breakpoint
CREATE INDEX state_roster_state_entry_idx ON state_roster_members (state_entry_id);
--> statement-breakpoint
CREATE INDEX contest_roster_student_idx ON contest_roster_members (annual_student_id);
--> statement-breakpoint
CREATE INDEX school_participations_school_idx ON school_participations (school_id);
--> statement-breakpoint
-- Resolved on every authenticated request to map a coordinator's region number to contests.
CREATE INDEX regions_number_idx ON regions (number);
--> statement-breakpoint
CREATE INDEX contests_region_idx ON contests (region_id);
