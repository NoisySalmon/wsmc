ALTER TABLE results ADD COLUMN knowdown_outcome TEXT
	CHECK (
		knowdown_outcome IS NULL
		OR (knowdown_outcome = 'eliminated' AND placement IS NULL)
		OR (knowdown_outcome = 'placed' AND placement IS NOT NULL AND placement BETWEEN 1 AND 4)
	);
--> statement-breakpoint
UPDATE results SET knowdown_outcome = 'placed'
WHERE placement IS NOT NULL AND entry_id IN (SELECT id FROM entries WHERE category = 'knowdown');
