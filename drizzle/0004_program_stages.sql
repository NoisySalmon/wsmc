-- Replace the old setup/active distinction with explicit program stages.
ALTER TABLE seasons RENAME COLUMN status TO legacy_status;
ALTER TABLE seasons ADD COLUMN status text NOT NULL DEFAULT 'regional' CHECK (status IN ('regional', 'qualifications', 'state', 'archived'));
UPDATE seasons SET status = CASE WHEN legacy_status = 'archived' THEN 'archived' ELSE 'regional' END;
ALTER TABLE seasons DROP COLUMN legacy_status;
CREATE UNIQUE INDEX seasons_one_current_uq ON seasons ((1)) WHERE status <> 'archived';
ALTER TABLE contests DROP COLUMN settings_json;
-- Older seasons did not automatically receive their state contest.
INSERT INTO contests (id, season_id, region_id, kind, name, lifecycle)
SELECT lower(hex(randomblob(16))), s.id, NULL, 'state', s.year || ' State Contest', 'setup'
FROM seasons s WHERE NOT EXISTS (SELECT 1 FROM contests c WHERE c.season_id = s.id AND c.kind = 'state');

-- Archived program records are immutable, including writes from other pages.
CREATE TRIGGER seasons_archived_update BEFORE UPDATE ON seasons WHEN OLD.status = 'archived'
BEGIN SELECT RAISE(ABORT, 'Archived seasons are permanently read-only.'); END;
CREATE TRIGGER seasons_archived_delete BEFORE DELETE ON seasons WHEN OLD.status = 'archived'
BEGIN SELECT RAISE(ABORT, 'Archived seasons are permanently read-only.'); END;
CREATE TRIGGER regions_archived_insert BEFORE INSERT ON regions
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER regions_archived_update BEFORE UPDATE ON regions
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived') OR EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER regions_archived_delete BEFORE DELETE ON regions
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER contests_archived_insert BEFORE INSERT ON contests
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER contests_archived_update BEFORE UPDATE ON contests
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived') OR EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER contests_archived_delete BEFORE DELETE ON contests
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER annual_students_archived_insert BEFORE INSERT ON annual_students
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER annual_students_archived_update BEFORE UPDATE ON annual_students
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived') OR EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER annual_students_archived_delete BEFORE DELETE ON annual_students
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER qualification_rounds_archived_insert BEFORE INSERT ON qualification_rounds
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER qualification_rounds_archived_update BEFORE UPDATE ON qualification_rounds
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived') OR EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER qualification_rounds_archived_delete BEFORE DELETE ON qualification_rounds
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER qualifications_archived_insert BEFORE INSERT ON qualifications
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER qualifications_archived_update BEFORE UPDATE ON qualifications
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived') OR EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER qualifications_archived_delete BEFORE DELETE ON qualifications
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER coach_assignments_archived_insert BEFORE INSERT ON coach_assignments
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER coach_assignments_archived_update BEFORE UPDATE ON coach_assignments
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived') OR EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER coach_assignments_archived_delete BEFORE DELETE ON coach_assignments
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER statewide_assignments_archived_insert BEFORE INSERT ON statewide_assignments
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER statewide_assignments_archived_update BEFORE UPDATE ON statewide_assignments
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived') OR EXISTS (SELECT 1 FROM seasons WHERE id = NEW.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER statewide_assignments_archived_delete BEFORE DELETE ON statewide_assignments
WHEN EXISTS (SELECT 1 FROM seasons WHERE id = OLD.season_id AND status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER school_participations_archived_insert BEFORE INSERT ON school_participations
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER school_participations_archived_update BEFORE UPDATE ON school_participations
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER school_participations_archived_delete BEFORE DELETE ON school_participations
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER contest_roster_members_archived_insert BEFORE INSERT ON contest_roster_members
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER contest_roster_members_archived_update BEFORE UPDATE ON contest_roster_members
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER contest_roster_members_archived_delete BEFORE DELETE ON contest_roster_members
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER entries_archived_insert BEFORE INSERT ON entries
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER entries_archived_update BEFORE UPDATE ON entries
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER entries_archived_delete BEFORE DELETE ON entries
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER state_attendances_archived_insert BEFORE INSERT ON state_attendances
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER state_attendances_archived_update BEFORE UPDATE ON state_attendances
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER state_attendances_archived_delete BEFORE DELETE ON state_attendances
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER state_roster_members_archived_insert BEFORE INSERT ON state_roster_members
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER state_roster_members_archived_update BEFORE UPDATE ON state_roster_members
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER state_roster_members_archived_delete BEFORE DELETE ON state_roster_members
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER imports_archived_insert BEFORE INSERT ON imports
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER imports_archived_update BEFORE UPDATE ON imports
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER imports_archived_delete BEFORE DELETE ON imports
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER regional_coordinator_assignments_archived_insert BEFORE INSERT ON regional_coordinator_assignments
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER regional_coordinator_assignments_archived_update BEFORE UPDATE ON regional_coordinator_assignments
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER regional_coordinator_assignments_archived_delete BEFORE DELETE ON regional_coordinator_assignments
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER scorekeeper_assignments_archived_insert BEFORE INSERT ON scorekeeper_assignments
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER scorekeeper_assignments_archived_update BEFORE UPDATE ON scorekeeper_assignments
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = NEW.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER scorekeeper_assignments_archived_delete BEFORE DELETE ON scorekeeper_assignments
WHEN EXISTS (SELECT 1 FROM contests c JOIN seasons s ON s.id = c.season_id WHERE c.id = OLD.contest_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER entry_members_archived_insert BEFORE INSERT ON entry_members
WHEN EXISTS (SELECT 1 FROM entries e JOIN contests c ON c.id = e.contest_id JOIN seasons s ON s.id = c.season_id WHERE e.id = NEW.entry_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER entry_members_archived_update BEFORE UPDATE ON entry_members
WHEN EXISTS (SELECT 1 FROM entries e JOIN contests c ON c.id = e.contest_id JOIN seasons s ON s.id = c.season_id WHERE e.id = OLD.entry_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM entries e JOIN contests c ON c.id = e.contest_id JOIN seasons s ON s.id = c.season_id WHERE e.id = NEW.entry_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER entry_members_archived_delete BEFORE DELETE ON entry_members
WHEN EXISTS (SELECT 1 FROM entries e JOIN contests c ON c.id = e.contest_id JOIN seasons s ON s.id = c.season_id WHERE e.id = OLD.entry_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER results_archived_insert BEFORE INSERT ON results
WHEN EXISTS (SELECT 1 FROM entries e JOIN contests c ON c.id = e.contest_id JOIN seasons s ON s.id = c.season_id WHERE e.id = NEW.entry_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER results_archived_update BEFORE UPDATE ON results
WHEN EXISTS (SELECT 1 FROM entries e JOIN contests c ON c.id = e.contest_id JOIN seasons s ON s.id = c.season_id WHERE e.id = OLD.entry_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM entries e JOIN contests c ON c.id = e.contest_id JOIN seasons s ON s.id = c.season_id WHERE e.id = NEW.entry_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER results_archived_delete BEFORE DELETE ON results
WHEN EXISTS (SELECT 1 FROM entries e JOIN contests c ON c.id = e.contest_id JOIN seasons s ON s.id = c.season_id WHERE e.id = OLD.entry_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER qualification_reasons_archived_insert BEFORE INSERT ON qualification_reasons
WHEN EXISTS (SELECT 1 FROM qualifications q JOIN seasons s ON s.id = q.season_id WHERE q.id = NEW.qualification_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER qualification_reasons_archived_update BEFORE UPDATE ON qualification_reasons
WHEN EXISTS (SELECT 1 FROM qualifications q JOIN seasons s ON s.id = q.season_id WHERE q.id = OLD.qualification_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM qualifications q JOIN seasons s ON s.id = q.season_id WHERE q.id = NEW.qualification_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER qualification_reasons_archived_delete BEFORE DELETE ON qualification_reasons
WHEN EXISTS (SELECT 1 FROM qualifications q JOIN seasons s ON s.id = q.season_id WHERE q.id = OLD.qualification_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER state_team_berths_archived_insert BEFORE INSERT ON state_team_berths
WHEN EXISTS (SELECT 1 FROM qualifications q JOIN seasons s ON s.id = q.season_id WHERE q.id = NEW.qualification_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER state_team_berths_archived_update BEFORE UPDATE ON state_team_berths
WHEN EXISTS (SELECT 1 FROM qualifications q JOIN seasons s ON s.id = q.season_id WHERE q.id = OLD.qualification_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM qualifications q JOIN seasons s ON s.id = q.season_id WHERE q.id = NEW.qualification_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
CREATE TRIGGER state_team_berths_archived_delete BEFORE DELETE ON state_team_berths
WHEN EXISTS (SELECT 1 FROM qualifications q JOIN seasons s ON s.id = q.season_id WHERE q.id = OLD.qualification_id AND s.status = 'archived')
BEGIN SELECT RAISE(ABORT, 'Archived seasons are read-only.'); END;
