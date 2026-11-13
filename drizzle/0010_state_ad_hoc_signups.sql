CREATE TABLE state_ad_hoc_signups (
 contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
 school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
 annual_student_id TEXT NOT NULL REFERENCES annual_students(id) ON DELETE RESTRICT,
 created_at INTEGER NOT NULL,
 PRIMARY KEY (contest_id, annual_student_id)
);
