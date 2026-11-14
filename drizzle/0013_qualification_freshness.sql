-- Existing drafts must be saved again before publication. Existing published lists remain intact.
ALTER TABLE qualification_rounds ADD COLUMN source_revision text;
--> statement-breakpoint
-- Do not silently discard competing historical lists: duplicates require explicit review.
CREATE UNIQUE INDEX qualification_rounds_season_kind_uq ON qualification_rounds(season_id, kind);
