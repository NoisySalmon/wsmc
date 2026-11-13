CREATE TABLE state_ad_hoc_signups_next (
 contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
 school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
 annual_student_id TEXT NOT NULL REFERENCES annual_students(id) ON DELETE RESTRICT,
 category TEXT NOT NULL CHECK (category IN ('team_contest', 'topical_team')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY (contest_id, annual_student_id, category)
);
--> statement-breakpoint
INSERT INTO state_ad_hoc_signups_next (contest_id, school_id, annual_student_id, category, created_at)
 SELECT contest_id, school_id, annual_student_id, 'team_contest', created_at FROM state_ad_hoc_signups;
--> statement-breakpoint
DROP TABLE state_ad_hoc_signups;
--> statement-breakpoint
ALTER TABLE state_ad_hoc_signups_next RENAME TO state_ad_hoc_signups;
