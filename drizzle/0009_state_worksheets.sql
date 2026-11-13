CREATE TABLE state_worksheets (
 contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
 school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
 rows_json TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY (contest_id, school_id)
);
