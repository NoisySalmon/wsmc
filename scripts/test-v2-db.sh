#!/usr/bin/env bash
set -euo pipefail

database_path="$(mktemp /tmp/wsmc-v2-db-XXXXXX.sqlite)"
restore_path="$(mktemp /tmp/wsmc-v2-restore-XXXXXX.sqlite)"
trap 'rm -f "$database_path" "$database_path-wal" "$database_path-shm" "$restore_path" "$restore_path-wal" "$restore_path-shm"' EXIT

sqlite3 "$database_path" < drizzle/0000_woozy_bruce_banner.sql
sqlite3 "$database_path" < drizzle/0001_v2_baseline.sql
sqlite3 "$database_path" < drizzle/0002_knowdown_outcomes.sql
sqlite3 "$database_path" < drizzle/0003_school_division.sql
sqlite3 "$database_path" < scripts/seed.sql

counts="$(sqlite3 -noheader -separator '|' "$database_path" "SELECT (SELECT COUNT(*) FROM seasons), (SELECT COUNT(*) FROM regions), (SELECT COUNT(*) FROM contests), (SELECT COUNT(*) FROM schools), (SELECT COUNT(*) FROM annual_students), (SELECT COUNT(*) FROM entries), (SELECT COUNT(*) FROM entry_members);")"
[[ "$counts" == "1|3|4|3|9|19|28" ]] || { echo "unexpected seed counts: $counts" >&2; exit 1; }

# Exercise the documented backup/restore path against a fresh SQLite copy.
sqlite3 "$database_path" .dump | sqlite3 "$restore_path"
restored_counts="$(sqlite3 -noheader -separator '|' "$restore_path" "SELECT (SELECT COUNT(*) FROM seasons), (SELECT COUNT(*) FROM regions), (SELECT COUNT(*) FROM contests), (SELECT COUNT(*) FROM schools), (SELECT COUNT(*) FROM annual_students), (SELECT COUNT(*) FROM entries), (SELECT COUNT(*) FROM entry_members);")"
[[ "$restored_counts" == "$counts" ]] || { echo "backup/restore changed seed counts: $restored_counts" >&2; exit 1; }

category_count="$(sqlite3 -noheader "$database_path" "SELECT COUNT(DISTINCT category) FROM entries;")"
[[ "$category_count" == "5" ]] || { echo "seed does not cover all categories" >&2; exit 1; }

knowdown_outcomes="$(sqlite3 -noheader -separator '|' "$database_path" "SELECT SUM(knowdown_outcome = 'placed'), SUM(knowdown_outcome = 'eliminated') FROM results JOIN entries ON entries.id = results.entry_id WHERE entries.contest_id = 'contest-region-1' AND entries.category = 'knowdown';")"
[[ "$knowdown_outcomes" == "4|2" ]] || { echo "demo Knowdown field should have four places and two eliminated entrants: $knowdown_outcomes" >&2; exit 1; }
fourth_place="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM results JOIN entries ON entries.id = results.entry_id WHERE entries.contest_id = 'contest-region-1' AND entries.category = 'knowdown' AND results.knowdown_outcome = 'placed' AND results.placement = 4;")"
[[ "$fourth_place" == "1" ]] || { echo "demo Knowdown field must retain fourth place internally" >&2; exit 1; }
knowdown_qualifications="$(sqlite3 -noheader -separator '|' "$database_path" "SELECT SUM(qualifications.active = 1), SUM(qualifications.active = 0) FROM qualifications JOIN entries ON entries.id = qualifications.entry_id WHERE qualifications.round_id = 'round-regional-2026' AND entries.category = 'knowdown';")"
[[ "$knowdown_qualifications" == "3|1" ]] || { echo "demo qualifications should include the top three and inactive fourth-place alternate: $knowdown_qualifications" >&2; exit 1; }
alternate_reason="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM qualification_reasons JOIN qualifications ON qualifications.id = qualification_reasons.qualification_id WHERE qualifications.id = 'qualification-knowdown-beta-2' AND qualification_reasons.kind = 'knowdown_alternate' AND qualification_reasons.rank = 4;")"
[[ "$alternate_reason" == "1" ]] || { echo "fourth-place Knowdown qualification should carry its alternate reason" >&2; exit 1; }

team_grade_collisions="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM (SELECT entry_id, competing_grade FROM entry_members WHERE competing_grade IS NOT NULL GROUP BY entry_id, competing_grade HAVING COUNT(*) > 1);")"
[[ "$team_grade_collisions" == "0" ]] || { echo "seed repeats a competing grade within a team" >&2; exit 1; }

topical_overlap="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM entry_members tm JOIN entries te ON te.id = tm.entry_id JOIN entries ie ON ie.contest_id = te.contest_id AND ie.owner_school_id = te.owner_school_id AND ie.category = 'topical_individual' JOIN entry_members im ON im.entry_id = ie.id AND im.annual_student_id = tm.annual_student_id WHERE te.category = 'topical_team';")"
[[ "$topical_overlap" == "0" ]] || { echo "seed enters a student in both Topical Team and Topical Individual" >&2; exit 1; }

coach_registration="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM coach_assignments ca JOIN contests c ON c.season_id = ca.season_id JOIN school_participations p ON p.contest_id = c.id AND p.school_id = ca.school_id WHERE ca.user_id = 'user-coach-gamma' AND c.id = 'contest-region-2' AND c.lifecycle = 'registration_open';")"
[[ "$coach_registration" == "1" ]] || { echo "demo coach cannot reach the open regional registration" >&2; exit 1; }

cross_school_count="$(sqlite3 -noheader "$database_path" "SELECT COUNT(DISTINCT annual_students.school_id) FROM entry_members JOIN entries ON entries.id = entry_members.entry_id JOIN annual_students ON annual_students.id = entry_members.annual_student_id WHERE entries.id = 'entry-state-cross-school-team';")"
[[ "$cross_school_count" == "2" ]] || { echo "state entry is not cross-school" >&2; exit 1; }

if sqlite3 "$database_path" "INSERT INTO annual_students (id, season_id, school_id, name, actual_grade) VALUES ('invalid-grade', 'season-2026', 'school-alpha', 'Invalid', 8);" 2>/dev/null; then
	 echo "invalid annual student grade was accepted" >&2
	 exit 1
fi

if sqlite3 "$database_path" "INSERT INTO entry_members (entry_id, annual_student_id, competing_grade) VALUES ('entry-r1-team-alpha', 'student-alpha-12', 12);" 2>/dev/null; then
	 echo "duplicate entry membership was accepted" >&2
	 exit 1
fi

if sqlite3 "$database_path" "INSERT INTO contest_roster_members (contest_id, participation_id, annual_student_id) VALUES ('contest-region-2', 'participation-r1-alpha', 'student-gamma-12');" 2>/dev/null; then
	 echo "cross-contest roster participation was accepted" >&2
	 exit 1
fi

if sqlite3 "$database_path" "INSERT INTO contests (id, season_id, region_id, kind, name) VALUES ('second-state', 'season-2026', NULL, 'state', 'Second State Contest');" 2>/dev/null; then
	 echo "second state contest was accepted for one season" >&2
	 exit 1
fi

if sqlite3 "$database_path" "INSERT INTO contests (id, season_id, region_id, kind, name, lifecycle) VALUES ('invalid-lifecycle', 'season-2026', NULL, 'state', 'Invalid Lifecycle', 'not-a-lifecycle');" 2>/dev/null; then
	 echo "invalid contest lifecycle was accepted" >&2
	 exit 1
fi

sqlite3 "$database_path" "UPDATE schools SET active = 0 WHERE id = 'school-beta';"
archived="$(sqlite3 -noheader "$database_path" "SELECT active FROM schools WHERE id = 'school-beta';")"
[[ "$archived" == "0" ]] || { echo "school archive state was not persisted" >&2; exit 1; }

# Auth flow invariants against the migrated D1-compatible database.
sqlite3 "$database_path" <<'SQL'
INSERT INTO users (id, email, display_name, status)
VALUES ('user-auth-fixture', 'auth-fixture@example.com', 'Auth Fixture', 'pending');
INSERT INTO sign_in_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
VALUES
  ('token-replay', 'user-auth-fixture', '1a9aae6fa51dd5f85d9170c8875eaa3fb2e60e663d4da8f9b507da54c8e4e341', 'sign_in', 2000, 1000),
  ('token-expired', 'user-auth-fixture', '9450637a6cfce60f2c2b31b97578c94080d28a202656cde6fa812ac38aa9eb24', 'sign_in', 1000, 500),
  ('token-disabled', 'user-auth-fixture', '528016dea2d2e5c3c8e68a56dbe9dd1e49e80d1b51d4b3ad7ccae9bfc2d740c5', 'sign_in', 3000, 1000);
INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at)
VALUES ('session-disabled', 'user-auth-fixture', 900000, 1000, 1000);
INSERT INTO coach_assignments (user_id, season_id, school_id)
VALUES ('user-coach-alpha-1', 'season-2026', 'school-beta');
SQL

sqlite3 "$database_path" "UPDATE sign_in_tokens SET used_at = 1500 WHERE id = 'token-replay' AND used_at IS NULL AND revoked_at IS NULL;"
replay_reuse_changes="$(sqlite3 -noheader "$database_path" "UPDATE sign_in_tokens SET used_at = 1600 WHERE id = 'token-replay' AND used_at IS NULL AND revoked_at IS NULL; SELECT changes();")"
[[ "$replay_reuse_changes" == "0" ]] || { echo "replayed sign-in token was accepted" >&2; exit 1; }

expired_usable="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM sign_in_tokens WHERE id = 'token-expired' AND revoked_at IS NULL AND used_at IS NULL AND expires_at > 1000;")"
[[ "$expired_usable" == "0" ]] || { echo "expired sign-in token was considered usable" >&2; exit 1; }

sqlite3 "$database_path" "UPDATE users SET status = 'disabled' WHERE id = 'user-auth-fixture'; UPDATE sign_in_tokens SET revoked_at = 2000 WHERE user_id = 'user-auth-fixture' AND used_at IS NULL AND revoked_at IS NULL; UPDATE sessions SET revoked_at = 2000 WHERE user_id = 'user-auth-fixture' AND revoked_at IS NULL;"
disabled_access="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM users JOIN sessions ON sessions.user_id = users.id WHERE users.id = 'user-auth-fixture' AND users.status = 'active' AND sessions.revoked_at IS NULL;")"
[[ "$disabled_access" == "0" ]] || { echo "disabled user retained active access" >&2; exit 1; }

multi_school_coach="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM coach_assignments WHERE user_id = 'user-coach-alpha-1' AND season_id = 'season-2026';")"
[[ "$multi_school_coach" == "2" ]] || { echo "multi-school coach assignment was not preserved" >&2; exit 1; }

state_coordinator_regional_assignments="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM regional_coordinator_assignments WHERE user_id = 'user-coordinator';")"
[[ "$state_coordinator_regional_assignments" == "0" ]] || { echo "state coordinator has regional assignments" >&2; exit 1; }

distinct_regional_coordinators="$(sqlite3 -noheader "$database_path" "SELECT COUNT(DISTINCT user_id) FROM regional_coordinator_assignments WHERE contest_id IN ('contest-region-1', 'contest-region-2');")"
[[ "$distinct_regional_coordinators" == "2" ]] || { echo "regional contests do not have distinct coordinators" >&2; exit 1; }

regional_coach_assignment="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM coach_assignments WHERE user_id = 'user-regional-coordinator' AND season_id = 'season-2026' AND school_id = 'school-alpha';")"
[[ "$regional_coach_assignment" == "1" ]] || { echo "Region 1 coordinator is not also assigned as a coach" >&2; exit 1; }

echo "v2 D1 integration checks passed"
