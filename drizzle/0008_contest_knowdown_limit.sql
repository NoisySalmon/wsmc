ALTER TABLE contests ADD COLUMN knowdown_limit integer NOT NULL DEFAULT 3 CHECK (knowdown_limit > 0);
