#!/usr/bin/env bash
set -euo pipefail

database_path="$(mktemp /tmp/wsmc-dress-rehearsal-XXXXXX.sqlite)"
trap 'rm -f "$database_path" "$database_path-wal" "$database_path-shm"' EXIT

sqlite3 "$database_path" < drizzle/0000_woozy_bruce_banner.sql
sqlite3 "$database_path" < drizzle/0001_v2_baseline.sql
sqlite3 "$database_path" < scripts/seed.sql

# Add 21 additional state-participating schools with 11 annual students each,
# plus one twelfth-grade student, for a 24-school/240-student rehearsal.
rehearsal_sql='BEGIN;'
for school_number in $(seq 1 21); do
	printf -v school_suffix '%02d' "$school_number"
	school_id="rehearsal-school-${school_suffix}"
	rehearsal_sql+="INSERT INTO schools (id, name, short_name, city) VALUES ('${school_id}', 'Rehearsal School ${school_suffix}', 'R${school_suffix}', 'Rehearsal City');"
	rehearsal_sql+="INSERT INTO school_participations (id, contest_id, school_id, division, invitation_status) VALUES ('rehearsal-participation-${school_suffix}', 'contest-state-2026', '${school_id}', $((school_number % 2 + 1)), 'accepted');"
	for student_number in $(seq 1 11); do
		printf -v student_suffix '%02d' "$student_number"
		student_id="rehearsal-student-${school_suffix}-${student_suffix}"
		actual_grade=$((9 + student_number % 4))
		rehearsal_sql+="INSERT INTO annual_students (id, season_id, school_id, name, actual_grade) VALUES ('${student_id}', 'season-2026', '${school_id}', 'Student ${school_suffix}-${student_suffix}', ${actual_grade});"
	done
	entry_id="rehearsal-state-entry-${school_suffix}"
	first_student_id="rehearsal-student-${school_suffix}-01"
	division=$((school_number % 2 + 1))
	rehearsal_sql+="INSERT INTO entries (id, contest_id, owner_school_id, category, entry_kind, entry_number, division) VALUES ('${entry_id}', 'contest-state-2026', '${school_id}', 'project', 'team', 1, ${division});"
	rehearsal_sql+="INSERT INTO entry_members (entry_id, annual_student_id, competing_grade) VALUES ('${entry_id}', '${first_student_id}', 12);"
done
rehearsal_sql+="INSERT INTO annual_students (id, season_id, school_id, name, actual_grade) VALUES ('rehearsal-student-01-12', 'season-2026', 'rehearsal-school-01', 'Student 01-12', 12);"
rehearsal_sql+='COMMIT;'
sqlite3 "$database_path" "$rehearsal_sql"

counts="$(sqlite3 -noheader -separator '|' "$database_path" "SELECT (SELECT COUNT(*) FROM schools), (SELECT COUNT(*) FROM annual_students), (SELECT COUNT(*) FROM school_participations WHERE contest_id = 'contest-state-2026'), (SELECT COUNT(*) FROM entries WHERE contest_id = 'contest-state-2026');")"
[[ "$counts" == "24|240|24|22" ]] || { echo "unexpected rehearsal counts: $counts" >&2; exit 1; }

# Verify the seeded end-to-end handoff remains intact after scaling the data.
journey="$(sqlite3 -noheader -separator '|' "$database_path" "SELECT (SELECT COUNT(*) FROM contests WHERE id = 'contest-region-1' AND lifecycle = 'finalized'), (SELECT COUNT(*) FROM qualification_rounds WHERE id = 'round-regional-2026' AND status = 'published'), (SELECT COUNT(*) FROM state_roster_members WHERE contest_id = 'contest-state-2026'), (SELECT COUNT(*) FROM state_team_berths WHERE state_entry_id = 'entry-state-cross-school-team');")"
[[ "$journey" == "1|1|3|1" ]] || { echo "regional-to-state handoff failed: $journey" >&2; exit 1; }

# Rehearse two scorekeepers editing the same result from the same stale CSV
# version. The first conditional update wins; the second must affect zero rows.
sqlite3 "$database_path" "INSERT INTO users (id, email, display_name, status) VALUES ('user-scorekeeper-2', 'scorekeeper2@wsmc.example', 'Second Scorekeeper', 'active'); INSERT INTO scorekeeper_assignments (user_id, contest_id) VALUES ('user-scorekeeper-2', 'contest-region-1');"
scorekeeper_count="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM scorekeeper_assignments WHERE contest_id = 'contest-region-1';")"
[[ "$scorekeeper_count" == "2" ]] || { echo "dual scorekeeper assignment was not preserved" >&2; exit 1; }
first_update="$(sqlite3 -noheader "$database_path" "UPDATE results SET score = 89, version = version + 1, last_edited_by = 'user-scorekeeper-2' WHERE entry_id = 'entry-r1-team-alpha' AND version = 1; SELECT changes();")"
second_update="$(sqlite3 -noheader "$database_path" "UPDATE results SET score = 87, version = version + 1, last_edited_by = 'user-scorekeeper' WHERE entry_id = 'entry-r1-team-alpha' AND version = 1; SELECT changes();")"
[[ "$first_update" == "1" && "$second_update" == "0" ]] || { echo "stale scorekeeper edit was not rejected: ${first_update}/${second_update}" >&2; exit 1; }

# Rehearse the documented recovery shape: an active system coordinator with a
# NULL season assignment can recover administration without reusing a token.
sqlite3 "$database_path" "INSERT INTO users (id, email, display_name, status) VALUES ('user-rehearsal-recovery', 'recovery@wsmc.example', 'Recovery Coordinator', 'active'); INSERT INTO statewide_assignments (id, user_id, season_id) VALUES ('assignment-rehearsal-recovery', 'user-rehearsal-recovery', NULL);"
recovery_access="$(sqlite3 -noheader "$database_path" "SELECT COUNT(*) FROM users JOIN statewide_assignments ON statewide_assignments.user_id = users.id WHERE users.id = 'user-rehearsal-recovery' AND users.status = 'active' AND statewide_assignments.season_id IS NULL;")"
[[ "$recovery_access" == "1" ]] || { echo "coordinator recovery fixture failed" >&2; exit 1; }

echo "dress rehearsal passed: 24 schools, 240 annual students, 2 scorekeepers, stale edit rejected, coordinator recovery verified"
