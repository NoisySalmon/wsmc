#!/usr/bin/env bash
set -euo pipefail

database_path="$(mktemp /tmp/wsmc-v2-db-XXXXXX.sqlite)"
trap 'rm -f "$database_path" "$database_path-wal" "$database_path-shm"' EXIT

sqlite3 "$database_path" < drizzle/0000_woozy_bruce_banner.sql
sqlite3 "$database_path" < drizzle/0001_v2_baseline.sql
sqlite3 "$database_path" < scripts/seed.sql

counts="$(sqlite3 -noheader -separator '|' "$database_path" "SELECT (SELECT COUNT(*) FROM seasons), (SELECT COUNT(*) FROM regions), (SELECT COUNT(*) FROM contests), (SELECT COUNT(*) FROM schools), (SELECT COUNT(*) FROM annual_students), (SELECT COUNT(*) FROM entries), (SELECT COUNT(*) FROM entry_members);")"
[[ "$counts" == "1|2|3|3|7|15|24" ]] || { echo "unexpected seed counts: $counts" >&2; exit 1; }

category_count="$(sqlite3 -noheader "$database_path" "SELECT COUNT(DISTINCT category) FROM entries;")"
[[ "$category_count" == "5" ]] || { echo "seed does not cover all categories" >&2; exit 1; }

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

if sqlite3 "$database_path" "INSERT INTO contests (id, season_id, region_id, kind, name) VALUES ('second-state', 'season-2026', NULL, 'state', 'Second State Contest');" 2>/dev/null; then
	 echo "second state contest was accepted for one season" >&2
	 exit 1
fi

sqlite3 "$database_path" "UPDATE schools SET active = 0 WHERE id = 'school-beta';"
archived="$(sqlite3 -noheader "$database_path" "SELECT active FROM schools WHERE id = 'school-beta';")"
[[ "$archived" == "0" ]] || { echo "school archive state was not persisted" >&2; exit 1; }

echo "v2 D1 integration checks passed"
