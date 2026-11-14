-- Revision changes invalidate finalization reports and qualification drafts.
ALTER TABLE contests ADD COLUMN scoring_revision INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_results_insert AFTER INSERT ON results
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT contest_id FROM entries WHERE id = NEW.entry_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_results_update AFTER UPDATE ON results
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT contest_id FROM entries WHERE id = NEW.entry_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_results_delete AFTER DELETE ON results
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT contest_id FROM entries WHERE id = OLD.entry_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_entries_insert AFTER INSERT ON entries
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT NEW.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_entries_update AFTER UPDATE ON entries
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT NEW.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_entries_delete AFTER DELETE ON entries
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT OLD.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_entry_members_insert AFTER INSERT ON entry_members
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT contest_id FROM entries WHERE id = NEW.entry_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_entry_members_update AFTER UPDATE ON entry_members
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT contest_id FROM entries WHERE id = NEW.entry_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_entry_members_delete AFTER DELETE ON entry_members
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT contest_id FROM entries WHERE id = OLD.entry_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_school_participations_insert AFTER INSERT ON school_participations
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT NEW.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_school_participations_update AFTER UPDATE ON school_participations
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT NEW.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_school_participations_delete AFTER DELETE ON school_participations
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT OLD.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_state_ad_hoc_signups_insert AFTER INSERT ON state_ad_hoc_signups
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT NEW.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_state_ad_hoc_signups_update AFTER UPDATE ON state_ad_hoc_signups
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT NEW.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_state_ad_hoc_signups_delete AFTER DELETE ON state_ad_hoc_signups
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT OLD.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_state_roster_members_insert AFTER INSERT ON state_roster_members
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT NEW.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_state_roster_members_update AFTER UPDATE ON state_roster_members
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT NEW.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_state_roster_members_delete AFTER DELETE ON state_roster_members
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT OLD.contest_id);
END;
--> statement-breakpoint
CREATE TRIGGER scoring_revision_student_grade AFTER UPDATE OF actual_grade ON annual_students
WHEN OLD.actual_grade <> NEW.actual_grade
BEGIN
 UPDATE contests SET scoring_revision = scoring_revision + 1 WHERE id IN (SELECT e.contest_id FROM entries e JOIN entry_members m ON m.entry_id = e.id WHERE m.annual_student_id = NEW.id);
END;
