-- Representative v2 seed for local development and persistence checks.
-- IDs are stable so fixtures and screenshots can refer to them.

PRAGMA foreign_keys = ON;

INSERT INTO seasons (id, year, name, status) VALUES
  ('season-2026', 2026, '2026 WSMC', 'active');

INSERT INTO regions (id, season_id, number, name) VALUES
  ('region-1-2026', 'season-2026', 1, 'Northwest'),
  ('region-2-2026', 'season-2026', 2, 'Southwest');

INSERT INTO contests (id, season_id, region_id, kind, name, starts_at, lifecycle) VALUES
  ('contest-region-1', 'season-2026', 'region-1-2026', 'regional', 'Region 1 Regional Contest', 1760000000000, 'finalized'),
  ('contest-region-2', 'season-2026', 'region-2-2026', 'regional', 'Region 2 Regional Contest', 1760086400000, 'registration_open'),
  ('contest-state-2026', 'season-2026', NULL, 'state', '2026 State Contest', 1765000000000, 'registration_open');

INSERT INTO schools (id, name, short_name, address, city, state, postal_code, contact_email) VALUES
  ('school-alpha', 'Alpha High School', 'Alpha', '100 Main St', 'Seattle', 'WA', '98101', 'office@alpha.example'),
  ('school-beta', 'Beta High School', 'Beta', '200 Oak St', 'Tacoma', 'WA', '98401', 'office@beta.example'),
  ('school-gamma', 'Gamma High School', 'Gamma', '300 Pine St', 'Olympia', 'WA', '98501', 'office@gamma.example');

INSERT INTO school_participations (id, contest_id, school_id, division, invitation_status) VALUES
  ('participation-r1-alpha', 'contest-region-1', 'school-alpha', 1, 'accepted'),
  ('participation-r1-beta', 'contest-region-1', 'school-beta', 2, 'accepted'),
  ('participation-r2-gamma', 'contest-region-2', 'school-gamma', 1, 'accepted'),
  ('participation-state-alpha', 'contest-state-2026', 'school-alpha', 1, 'accepted'),
  ('participation-state-beta', 'contest-state-2026', 'school-beta', 2, 'accepted'),
  ('participation-state-gamma', 'contest-state-2026', 'school-gamma', 1, 'accepted');

INSERT INTO users (id, email, display_name, status) VALUES
  ('user-coordinator', 'coordinator@wsmc.example', 'State Coordinator', 'active'),
  ('user-coach-alpha-1', 'coach1@alpha.example', 'Alpha Coach One', 'active'),
  ('user-coach-alpha-2', 'coach2@alpha.example', 'Alpha Coach Two', 'active'),
  ('user-coach-beta', 'coach@beta.example', 'Beta Coach', 'active'),
  ('user-scorekeeper', 'scorekeeper@wsmc.example', 'Region 1 Scorekeeper', 'active');

INSERT INTO statewide_assignments (id, user_id, season_id) VALUES ('assignment-state-2026', 'user-coordinator', 'season-2026');
INSERT INTO statewide_assignments (id, user_id, season_id) VALUES ('assignment-system', 'user-coordinator', NULL);
INSERT INTO regional_coordinator_assignments (user_id, contest_id) VALUES ('user-coordinator', 'contest-region-1');
INSERT INTO coach_assignments (user_id, season_id, school_id) VALUES
  ('user-coach-alpha-1', 'season-2026', 'school-alpha'),
  ('user-coach-alpha-2', 'season-2026', 'school-alpha'),
  ('user-coach-beta', 'season-2026', 'school-beta');
INSERT INTO scorekeeper_assignments (user_id, contest_id) VALUES ('user-scorekeeper', 'contest-region-1');

INSERT INTO annual_students (id, season_id, school_id, name, actual_grade) VALUES
  ('student-alpha-12', 'season-2026', 'school-alpha', 'Alex Alpha', 12),
  ('student-alpha-11', 'season-2026', 'school-alpha', 'Avery Alpha', 11),
  ('student-alpha-10', 'season-2026', 'school-alpha', 'Ash Alpha', 10),
  ('student-beta-12', 'season-2026', 'school-beta', 'Blair Beta', 12),
  ('student-beta-11', 'season-2026', 'school-beta', 'Brook Beta', 11),
  ('student-gamma-12', 'season-2026', 'school-gamma', 'Gray Gamma', 12),
  ('student-gamma-10', 'season-2026', 'school-gamma', 'Gale Gamma', 10);

INSERT INTO contest_roster_members (contest_id, participation_id, annual_student_id) VALUES
  ('contest-region-1', 'participation-r1-alpha', 'student-alpha-12'),
  ('contest-region-1', 'participation-r1-alpha', 'student-alpha-11'),
  ('contest-region-1', 'participation-r1-alpha', 'student-alpha-10'),
  ('contest-region-1', 'participation-r1-beta', 'student-beta-12'),
  ('contest-region-1', 'participation-r1-beta', 'student-beta-11'),
  ('contest-region-2', 'participation-r2-gamma', 'student-gamma-12'),
  ('contest-region-2', 'participation-r2-gamma', 'student-gamma-10'),
  ('contest-state-2026', 'participation-state-alpha', 'student-alpha-12'),
  ('contest-state-2026', 'participation-state-alpha', 'student-alpha-11'),
  ('contest-state-2026', 'participation-state-beta', 'student-beta-12'),
  ('contest-state-2026', 'participation-state-gamma', 'student-gamma-12');

-- Region 1 entries cover every category.
INSERT INTO entries (id, contest_id, owner_school_id, category, entry_kind, entry_number, division) VALUES
  ('entry-r1-project-alpha', 'contest-region-1', 'school-alpha', 'project', 'team', 1, 1),
  ('entry-r1-team-alpha', 'contest-region-1', 'school-alpha', 'team_contest', 'team', 1, 1),
  ('entry-r1-topical-team-beta', 'contest-region-1', 'school-beta', 'topical_team', 'team', 1, 2),
  ('entry-r1-topical-ind-alpha', 'contest-region-1', 'school-alpha', 'topical_individual', 'individual', 1, 1),
  ('entry-r1-topical-ind-beta', 'contest-region-1', 'school-beta', 'topical_individual', 'individual', 1, 2),
  ('entry-r1-knowdown-alpha', 'contest-region-1', 'school-alpha', 'knowdown', 'individual', 1, 1),
  ('entry-r1-knowdown-beta', 'contest-region-1', 'school-beta', 'knowdown', 'individual', 1, 2),
  ('entry-r1-project-beta', 'contest-region-1', 'school-beta', 'project', 'team', 1, 2),
  ('entry-r1-team-beta', 'contest-region-1', 'school-beta', 'team_contest', 'team', 1, 2);

INSERT INTO entry_members (entry_id, annual_student_id, competing_grade) VALUES
  ('entry-r1-project-alpha', 'student-alpha-12', 12),
  ('entry-r1-project-alpha', 'student-alpha-11', 12),
  ('entry-r1-team-alpha', 'student-alpha-12', 12),
  ('entry-r1-team-alpha', 'student-alpha-11', 11),
  ('entry-r1-topical-team-beta', 'student-beta-12', 12),
  ('entry-r1-topical-team-beta', 'student-beta-11', 11),
  ('entry-r1-topical-ind-alpha', 'student-alpha-10', NULL),
  ('entry-r1-topical-ind-beta', 'student-beta-12', NULL),
  ('entry-r1-knowdown-alpha', 'student-alpha-12', NULL),
  ('entry-r1-knowdown-beta', 'student-beta-12', NULL),
  ('entry-r1-project-beta', 'student-beta-12', 12),
  ('entry-r1-project-beta', 'student-beta-11', 11),
  ('entry-r1-team-beta', 'student-beta-12', 12),
  ('entry-r1-team-beta', 'student-beta-11', 11);

INSERT INTO results (entry_id, score, part1, part2, placement, version, last_edited_by) VALUES
  ('entry-r1-project-alpha', 92, NULL, NULL, 1, 1, 'user-scorekeeper'),
  ('entry-r1-team-alpha', 88, NULL, NULL, 1, 1, 'user-scorekeeper'),
  ('entry-r1-topical-team-beta', NULL, 70, 68, 1, 1, 'user-scorekeeper'),
  ('entry-r1-topical-ind-alpha', NULL, 65, 72, 1, 1, 'user-scorekeeper'),
  ('entry-r1-topical-ind-beta', NULL, 60, 64, 2, 1, 'user-scorekeeper'),
  ('entry-r1-knowdown-alpha', NULL, NULL, NULL, 1, 1, 'user-scorekeeper'),
  ('entry-r1-knowdown-beta', NULL, NULL, NULL, 2, 1, 'user-scorekeeper'),
  ('entry-r1-project-beta', 81, NULL, NULL, 1, 1, 'user-scorekeeper'),
  ('entry-r1-team-beta', 79, NULL, NULL, 2, 1, 'user-scorekeeper');

-- Region 2 includes another entry in every category for statewide aggregation.
INSERT INTO entries (id, contest_id, owner_school_id, category, entry_kind, entry_number, division) VALUES
  ('entry-r2-project-gamma', 'contest-region-2', 'school-gamma', 'project', 'team', 1, 1),
  ('entry-r2-team-gamma', 'contest-region-2', 'school-gamma', 'team_contest', 'team', 1, 1),
  ('entry-r2-topical-team-gamma', 'contest-region-2', 'school-gamma', 'topical_team', 'team', 1, 1),
  ('entry-r2-topical-ind-gamma', 'contest-region-2', 'school-gamma', 'topical_individual', 'individual', 1, 1),
  ('entry-r2-knowdown-gamma', 'contest-region-2', 'school-gamma', 'knowdown', 'individual', 1, 1);
INSERT INTO entry_members (entry_id, annual_student_id, competing_grade) VALUES
  ('entry-r2-project-gamma', 'student-gamma-12', 12),
  ('entry-r2-project-gamma', 'student-gamma-10', 10),
  ('entry-r2-team-gamma', 'student-gamma-12', 12),
  ('entry-r2-team-gamma', 'student-gamma-10', 10),
  ('entry-r2-topical-team-gamma', 'student-gamma-12', 12),
  ('entry-r2-topical-team-gamma', 'student-gamma-10', 10),
  ('entry-r2-topical-ind-gamma', 'student-gamma-10', NULL),
  ('entry-r2-knowdown-gamma', 'student-gamma-12', NULL);

-- A sample frozen placement round and a state team berth.
INSERT INTO qualification_rounds (id, season_id, kind, status, created_by) VALUES
  ('round-regional-2026', 'season-2026', 'regional_placements', 'published', 'user-coordinator');
INSERT INTO qualifications (id, round_id, season_id, entry_id, student_id) VALUES
  ('qualification-project-alpha', 'round-regional-2026', 'season-2026', 'entry-r1-project-alpha', NULL),
  ('qualification-team-alpha', 'round-regional-2026', 'season-2026', 'entry-r1-team-alpha', NULL),
  ('qualification-topical-alpha', 'round-regional-2026', 'season-2026', 'entry-r1-topical-ind-alpha', 'student-alpha-10');
INSERT INTO qualification_reasons (id, qualification_id, kind, rank, scope, detail_json) VALUES
  ('reason-project-alpha-placement', 'qualification-project-alpha', 'regional_placement', 1, NULL, '{}'),
  ('reason-team-alpha-placement', 'qualification-team-alpha', 'regional_placement', 1, NULL, '{}'),
  ('reason-topical-alpha-overall', 'qualification-topical-alpha', 'regional_placement', 1, 'overall', '{}');

INSERT INTO entries (id, contest_id, owner_school_id, category, entry_kind, entry_number, division) VALUES
  ('entry-state-cross-school-team', 'contest-state-2026', NULL, 'team_contest', 'team', 1, 1);
INSERT INTO entry_members (entry_id, annual_student_id, competing_grade) VALUES
  ('entry-state-cross-school-team', 'student-alpha-12', 12),
  ('entry-state-cross-school-team', 'student-gamma-12', 12);
INSERT INTO state_team_berths (id, qualification_id, state_entry_id, school_id, category) VALUES
  ('berth-team-alpha', 'qualification-team-alpha', 'entry-state-cross-school-team', 'school-alpha', 'team_contest');
INSERT INTO state_attendances (contest_id, school_id, intent) VALUES
  ('contest-state-2026', 'school-alpha', 'attending'),
  ('contest-state-2026', 'school-beta', 'undecided');
INSERT INTO state_roster_members (contest_id, school_id, annual_student_id, admission_basis, qualification_id, state_entry_id) VALUES
  ('contest-state-2026', 'school-alpha', 'student-alpha-10', 'individual_qualification', 'qualification-topical-alpha', NULL),
  ('contest-state-2026', 'school-alpha', 'student-alpha-12', 'team_berth', NULL, 'entry-state-cross-school-team'),
  ('contest-state-2026', 'school-gamma', 'student-gamma-12', 'team_berth', NULL, 'entry-state-cross-school-team');
