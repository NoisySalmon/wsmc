#!/usr/bin/env bash
set -euo pipefail

# Run a disposable authenticated HTTP journey against the built Pages worker.
# This intentionally uses fixture sessions rather than email delivery so the
# test remains deterministic and never emits or reuses a real sign-in token.

port="${WSMC_E2E_PORT:-8791}"
base_url="http://127.0.0.1:${port}"
persist_dir="$(mktemp -d /tmp/wsmc-e2e-preview-XXXXXX)"
server_pid=""
response_file=""

cleanup() {
	if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
		kill "$server_pid" 2>/dev/null || true
		wait "$server_pid" 2>/dev/null || true
	fi
	rm -rf "$persist_dir"
}
trap cleanup EXIT

[[ -d .svelte-kit/cloudflare ]] || { echo "missing build output; run npm run build first" >&2; exit 1; }

d1() {
	npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" "$@" >/dev/null
}

d1 --file=drizzle/0000_woozy_bruce_banner.sql
d1 --file=drizzle/0001_v2_baseline.sql
d1 --file=drizzle/0002_knowdown_outcomes.sql
d1 --file=drizzle/0003_school_division.sql
d1 --file=drizzle/0004_program_stages.sql
d1 --file=drizzle/0005_season_year.sql
d1 --file=drizzle/0006_persistent_access.sql
d1 --file=scripts/seed.sql

# Exercise scoring in the open state while retaining the seeded regional and
# qualification records needed by the end-to-end handoff.
d1 --command="UPDATE contests SET lifecycle = 'scoring' WHERE id = 'contest-region-1'; INSERT INTO users (id, email, display_name, status) VALUES ('user-scorekeeper-2', 'scorekeeper2@wsmc.example', 'Region 2 Scorekeeper', 'active'); INSERT INTO scorekeeper_assignments (user_id, contest_id) VALUES ('user-scorekeeper-2', 'contest-region-2'); INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES ('e2e-coordinator-session', 'user-coordinator', 4102444800000, 1700000000000, 1700000000000), ('e2e-scorekeeper-session', 'user-scorekeeper', 4102444800000, 1700000000000, 1700000000000), ('e2e-scorekeeper-2-session', 'user-scorekeeper-2', 4102444800000, 1700000000000, 1700000000000), ('e2e-coach-session', 'user-coach-alpha-1', 4102444800000, 1700000000000, 1700000000000), ('e2e-gamma-coach-session', 'user-coach-gamma', 4102444800000, 1700000000000, 1700000000000), ('e2e-regional-session', 'user-regional-coordinator-2', 4102444800000, 1700000000000, 1700000000000);"

npx wrangler pages dev .svelte-kit/cloudflare --d1 DB=5c5a8cb8-f2b9-489a-8a2d-b32a87c70cce --local --persist-to "$persist_dir" --port "$port" >"$persist_dir/server.log" 2>&1 &
server_pid=$!

ready=0
for _ in $(seq 1 60); do
	if ! kill -0 "$server_pid" 2>/dev/null; then
		cat "$persist_dir/server.log" >&2
		exit 1
	fi
	if [[ "$(curl --silent --show-error --max-time 2 --output /dev/null --write-out '%{http_code}' "$base_url/login" 2>/dev/null)" == "200" ]]; then
		ready=1
		break
	fi
	sleep 0.25
done
if (( ready == 0 )); then
	echo "Pages preview did not become ready" >&2
	cat "$persist_dir/server.log" >&2
	exit 1
fi
response_file="$persist_dir/response-body"

status_for() {
	local method="$1"
	local path="$2"
	local session_id="${3:-}"
	shift 3 || true
	if [[ -n "$session_id" ]]; then
		curl --silent --show-error --max-time 10 --output "${response_file:-/dev/null}" --write-out '%{http_code}' --request "$method" -H "Origin: $base_url" -H "Cookie: wsmc_session=${session_id}" "$base_url$path" "$@"
	else
		curl --silent --show-error --max-time 10 --output "${response_file:-/dev/null}" --write-out '%{http_code}' --request "$method" -H "Origin: $base_url" "$base_url$path" "$@"
	fi
}

assert_status() {
	local method="$1"
	local path="$2"
	local expected="$3"
	local session_id="${4:-}"
	if (( $# >= 4 )); then
		shift 4
	else
		shift 3
	fi
	local actual
	actual="$(status_for "$method" "$path" "$session_id" "$@")"
	if [[ "$actual" != "$expected" ]]; then
		echo "e2e check failed: $method $path returned $actual (expected $expected)" >&2
		[[ -z "$response_file" ]] || sed -n '1,80p' "$response_file" >&2
		cat "$persist_dir/server.log" >&2
		exit 1
	fi
	echo "e2e check passed: $method $path -> $actual"
}

assert_action_failure() {
	local method="$1"
	local path="$2"
	local expected="$3"
	local session_id="$4"
	shift 4
	local actual
	actual="$(status_for "$method" "$path" "$session_id" "$@")"
	if [[ "$actual" != "200" ]] || ! grep --fixed-strings --quiet "\"status\":${expected}" "$response_file"; then
		echo "e2e check failed: $method $path did not return structured action status $expected" >&2
		[[ -z "$response_file" ]] || sed -n '1,80p' "$response_file" >&2
		cat "$persist_dir/server.log" >&2
		exit 1
	fi
	echo "e2e check passed: $method $path -> action status $expected"
}

assert_page_contains() {
	local method="$1"
	local path="$2"
	local session_id="$3"
	local expected_text="$4"
	local actual
	actual="$(status_for "$method" "$path" "$session_id")"
	if [[ "$actual" != "200" ]] || ! grep --fixed-strings --quiet "$expected_text" "$response_file"; then
		echo "e2e check failed: $method $path did not contain: $expected_text" >&2
		[[ -z "$response_file" ]] || sed -n '1,100p' "$response_file" >&2
		cat "$persist_dir/server.log" >&2
		exit 1
	fi
	echo "e2e check passed: $method $path contains expected content"
}

coordinator="e2e-coordinator-session"
scorekeeper="e2e-scorekeeper-session"
scorekeeper2="e2e-scorekeeper-2-session"
coach="e2e-coach-session"
gamma_coach="e2e-gamma-coach-session"
regional="e2e-regional-session"

# Anonymous and exact public-route boundaries.
assert_status GET / 303
assert_status GET /state/contest-state-2026/results 404
assert_status GET /state/contest-state-2026/results/details 303

# Homepage links match the contest overview permissions for each role.
assert_regional_links() {
	local session_id="$1"
	local expected_ids="$2"
	assert_status GET / 200 "$session_id"
	node - "$response_file" "$expected_ids" <<'JS'
const fs = require('node:fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const actual = [...new Set([...html.matchAll(/href="\/contests\/([^"/?#]+)"/g)].map(match => match[1]))].sort();
const expected = process.argv[3].split(',').filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Homepage contest access: ${actual}; expected ${expected}`);
JS
}
assert_regional_links "$coordinator" 'contest-region-1,contest-region-2,contest-region-3,contest-region-4,contest-region-5,contest-region-6,contest-region-7,contest-region-8,contest-region-9,contest-region-10,contest-virtual-2026'
assert_regional_links "$regional" 'contest-region-2'
assert_regional_links "$scorekeeper" 'contest-region-1'
assert_regional_links "$scorekeeper2" 'contest-region-2'
assert_regional_links "$coach" ''
# Inaccessible contests remain visible as progress information.
assert_page_contains GET / "$coach" 'Region 2 — Tri Cities'
assert_page_contains GET / "$coach" 'Registration open'

# A statewide coordinator can traverse the operational handoff and execute a
# real mutation against the isolated database.
assert_status GET / 200 "$coordinator"
assert_status GET /program 404 "$coordinator"
assert_status GET /contests/contest-region-2 200 "$coordinator"
assert_status GET /registration/contest-region-2/school-gamma 200 "$coordinator"
assert_status GET /my-schools 200 "$gamma_coach"
assert_status GET /my-schools 403 "$scorekeeper"
# Participation is a region assignment, with no coach response workflow.
assert_status POST '/my-schools?/respond' 405 "$gamma_coach" --data 'participationId=participation-r2-gamma&contestId=contest-region-2&status=declined'
assert_action_failure POST '/regions?/assign' 400 "$regional" --data 'schoolId=school-alpha&contestId=contest-region-2'
assert_status POST '/regions?/assign' 403 "$regional" --data 'schoolId=school-gamma&contestId=contest-region-1'
# A walk-in school can be assigned, removed, and moved to another region.
d1 --command="INSERT INTO schools (id, name, division) VALUES ('school-walk-in', 'Walk-in High School', 2);"
assert_page_contains GET /regions "$regional" 'Walk-in High School'
assert_status POST '/regions?/assign' 200 "$regional" --data 'schoolId=school-walk-in&contestId=contest-region-2'
assert_page_contains GET /registration/contest-region-2/school-walk-in "$regional" 'Division 2'
walk_in_id="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT id FROM school_participations WHERE school_id = 'school-walk-in';" | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s)[0].results[0].id));')"
assert_status POST '/regions?/withdraw' 200 "$regional" --data "participationId=$walk_in_id&contestId=contest-region-2"
assert_status GET /registration/contest-region-2/school-walk-in 404 "$regional"
assert_status POST '/regions?/assign' 200 "$coordinator" --data 'schoolId=school-walk-in&contestId=contest-virtual-2026'
d1 --command="DELETE FROM school_participations WHERE school_id = 'school-walk-in'; DELETE FROM schools WHERE id = 'school-walk-in';"
# The coach worksheet validates the whole form before writing, then saves
# attendance and all events together. An absent student's assignments disappear.
worksheet='/registration/contest-region-2/school-gamma?/saveWorksheet'
worksheet_students='studentId=student-gamma-10&studentId=student-gamma-11&studentId=student-gamma-12'
assert_status POST "$worksheet" 403 "$coach" --data "$worksheet_students"
assert_action_failure POST "$worksheet" 400 "$gamma_coach" --data "$worksheet_students&attending_student-gamma-10=yes&team_student-gamma-10=1&teamGrade_student-gamma-10=12&attending_student-gamma-12=yes&team_student-gamma-12=1"
assert_action_failure POST "$worksheet" 400 "$gamma_coach" --data 'studentId=student-gamma-10&attending_student-gamma-10=yes'
worksheet_before="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT COUNT(*) AS count FROM entries WHERE contest_id = 'contest-region-2' AND owner_school_id = 'school-gamma';")"
node -e 'const rows=JSON.parse(require("fs").readFileSync(0,"utf8")); if(rows[0].results[0].count!==5) throw new Error("Rejected worksheet changed saved entries");' <<< "$worksheet_before"
assert_status POST "$worksheet" 200 "$gamma_coach" --data "$worksheet_students&attending_student-gamma-10=yes&team_student-gamma-10=2&topical_student-gamma-10=individual&attending_student-gamma-11=yes&topical_student-gamma-11=1&attending_student-gamma-12=no&team_student-gamma-12=2&knowdown_student-gamma-12=on"
worksheet_after="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT (SELECT COUNT(*) FROM contest_roster_members WHERE participation_id = 'participation-r2-gamma') AS attending, (SELECT COUNT(*) FROM entry_members JOIN entries ON entries.id = entry_members.entry_id WHERE entries.contest_id = 'contest-region-2' AND annual_student_id = 'student-gamma-12') AS absent_assignments, (SELECT entry_number FROM entries WHERE contest_id = 'contest-region-2' AND owner_school_id = 'school-gamma' AND category = 'team_contest') AS team;")"
node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"))[0].results[0]; if(r.attending!==2 || r.absent_assignments!==0 || r.team!==2) throw new Error("Worksheet did not reconcile attendance and events");' <<< "$worksheet_after"
assert_status POST '/registration/contest-region-2/school-gamma?/addStudent' 200 "$gamma_coach" --data 'name=New Student&actualGrade=9'
worksheet_new="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT COUNT(*) AS count FROM annual_students JOIN contest_roster_members ON annual_students.id = annual_student_id WHERE name = 'New Student' AND contest_id = 'contest-region-2';")"
node -e 'if(JSON.parse(require("fs").readFileSync(0,"utf8"))[0].results[0].count!==1) throw new Error("New student was not included automatically");' <<< "$worksheet_new"

assert_status GET /scoring/contest-region-2 409 "$coordinator"
assert_status GET /scoring/contest-region-1 200 "$coordinator"
assert_status GET /qualifications/season-2026 200 "$coordinator"
assert_status GET /state/contest-state-2026 200 "$coordinator"
assert_status GET /reports/season/season-2026 200 "$coordinator"
assert_status POST '/state/contest-state-2026?/setAttendance' 200 "$coordinator" --data 'schoolId=school-alpha&intent=attending'

# Two authenticated score editors can reach the same contest, but a stale
# conditional write is rejected and a scorekeeper cannot finalize.
assert_status GET /scoring/contest-region-1 200 "$scorekeeper"
assert_status GET /contests/contest-region-1 200 "$scorekeeper"
assert_status GET /contests/contest-region-1 403 "$coach"
assert_page_contains GET /contests/contest-region-1 "$coordinator" "Ash Alpha"
assert_page_contains GET /contests/contest-region-1 "$coordinator" "Bailey Beta"
assert_status POST '/scoring/contest-region-1?/saveResult' 200 "$coordinator" --data 'entryId=entry-r1-team-alpha&expectedVersion=1&score=89'
assert_action_failure POST '/scoring/contest-region-1?/saveResult' 409 "$scorekeeper" --data 'entryId=entry-r1-team-alpha&expectedVersion=1&score=87'
assert_status POST '/scoring/contest-region-1?/finalize' 403 "$scorekeeper" --data ''
assert_status POST '/scoring/contest-region-1?/finalize' 200 "$coordinator" --data ''
assert_status GET /results/contest-region-1 200 "$coordinator"
assert_page_contains GET /results/contest-region-1 "$coordinator" "4 ranked places from 6 registered entrants; 2 eliminated."
assert_page_contains GET /results/contest-region-1 "$coordinator" "4th (Alt)"
assert_page_contains GET /results/contest-region-1 "$coordinator" "Ash Alpha — Alpha"
assert_page_contains GET /results/contest-region-1 "$coordinator" "Bailey Beta — Beta"
assert_status GET /results/contest-region-1 403 "$coach"
assert_status GET '/reports/results?contestId=contest-region-1' 403 "$coach"
assert_status POST '/scoring/contest-region-1?/publish' 200 "$coordinator" --data ''
assert_status GET /results/contest-region-1 200 "$coach"
assert_status GET '/reports/results?contestId=contest-region-1' 200 "$coach"

# A regional-only coordinator can advance their own registration through roster
# lock and scoring, then review the missing scores without statewide help.
assert_status GET /contests/contest-region-2 200 "$regional"
assert_status GET '/reports/participation?contestId=contest-region-2' 404 "$regional"
assert_status POST '/contests/contest-region-2?/advanceLifecycle' 200 "$regional" --data 'lifecycle=roster_locked'
assert_status POST '/contests/contest-region-2?/advanceLifecycle' 200 "$regional" --data 'lifecycle=scoring'
assert_status GET /scoring/contest-region-2 200 "$regional"
assert_action_failure POST '/scoring/contest-region-2?/finalize' 400 "$regional" --data ''
assert_status GET /contests/contest-region-2/staff 200 "$regional"
assert_status GET /contests/contest-region-1/staff 403 "$regional"
assert_status GET /contests/contest-region-2/staff 403 "$scorekeeper2"
assert_status POST '/contests/contest-region-2/staff?/remove' 200 "$regional" --data 'role=scorekeeper&userId=user-scorekeeper-2'
assert_status GET /scoring/contest-region-2 403 "$scorekeeper2"
assert_status GET /scoring/contest-region-1 200 "$scorekeeper"

# Administrators grant persistent roles; regional coordinators grant event
# scorekeepers and persistent coach access only for participating schools.
assert_page_contains GET /admin/users "$coordinator" 'Add person'
assert_status GET /admin/users 403 "$regional"
assert_status POST '/admin/users?/add' 403 "$regional" --data 'email=scorekeeper2%40wsmc.example&role=statewide'
assert_status POST '/contests/contest-region-2/staff?/add' 403 "$regional" --data 'email=scorekeeper2%40wsmc.example&role=regional'
assert_status POST '/contests/contest-region-2/staff?/add' 403 "$regional" --data 'email=scorekeeper2%40wsmc.example&role=coach&schoolId=school-alpha'
assert_status POST '/contests/contest-region-2/staff?/add' 200 "$regional" --data 'email=scorekeeper2%40wsmc.example&displayName=Do+not+rename&role=coach&schoolId=school-gamma'
assert_page_contains GET /contests/contest-region-2/staff "$regional" 'Region 2 Scorekeeper'
assert_status POST '/admin/users?/add' 200 "$coordinator" --data 'email=scorekeeper2%40wsmc.example&role=scorekeeper&contestId=contest-region-2'
existing_access="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT (SELECT COUNT(*) FROM coach_assignments WHERE user_id = 'user-scorekeeper-2' AND school_id = 'school-gamma') AS coaches, (SELECT COUNT(*) FROM sign_in_tokens WHERE user_id = 'user-scorekeeper-2') AS tokens, (SELECT display_name FROM users WHERE id = 'user-scorekeeper-2') AS name;")"
node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"))[0].results[0]; if(r.coaches!==1 || r.tokens!==0 || r.name!=="Region 2 Scorekeeper") throw new Error("Adding access changed identity or sign-in tokens");' <<< "$existing_access"
assert_status POST '/contests/contest-region-2/staff?/remove' 200 "$regional" --data 'role=coach&schoolId=school-gamma&userId=user-scorekeeper-2'
assert_status POST '/admin/users?/disable' 200 "$coordinator" --data 'userId=user-scorekeeper-2'
assert_action_failure POST '/contests/contest-region-2/staff?/add' 400 "$regional" --data 'email=scorekeeper2%40wsmc.example&role=coach&schoolId=school-gamma'
assert_status POST '/admin/users?/enable' 200 "$coordinator" --data 'userId=user-scorekeeper-2'

# Repeated administrator grants are idempotent; removal preserves other roles.
d1 --command="INSERT INTO statewide_assignments (user_id) VALUES ('user-scorekeeper-2');"
assert_status POST '/admin/users?/add' 200 "$coordinator" --data 'email=scorekeeper2%40wsmc.example&role=statewide'
assert_status POST '/admin/users?/removeAssignment' 200 "$coordinator" --data 'userId=user-scorekeeper-2&assignmentKind=statewide'
admin_removal="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT (SELECT COUNT(*) FROM statewide_assignments WHERE user_id = 'user-scorekeeper-2') AS admins, (SELECT COUNT(*) FROM scorekeeper_assignments WHERE user_id = 'user-scorekeeper-2') AS scorekeepers;")"
node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"))[0].results[0]; if(r.admins!==0 || r.scorekeepers!==1) throw new Error("Administrator removal did not preserve unrelated roles");' <<< "$admin_removal"
assert_action_failure POST '/admin/users?/removeAssignment' 400 "$coordinator" --data 'userId=user-coordinator&assignmentKind=statewide'

# Cross-scope scorekeeper access is denied at the route boundary.
assert_status GET /state/contest-state-2026 403 "$scorekeeper"
attendance_check="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT intent FROM state_attendances WHERE contest_id = 'contest-state-2026' AND school_id = 'school-alpha';")"
[[ "$attendance_check" == *attending* ]] || { echo "attendance mutation was not persisted: $attendance_check" >&2; exit 1; }

# QR credentials use the same worker and disposable D1; no email is sent.
node scripts/qr-sign-in-journey.mjs "$base_url" "$persist_dir"

# One current season; archiving is permanent, then the next season bootstraps all contests.
assert_action_failure POST '/?/createSeason' 400 "$coordinator" --data 'year=2027'
assert_status POST '/?/setSeasonStatus' 403 "$regional" --data 'seasonId=season-2026&status=archived'
# Disabled accounts retain assignments but cannot sign in in any season.
d1 --command="INSERT INTO users (id, email, display_name, status) VALUES ('disabled-rollover', 'disabled.rollover@wsmc.example', 'Disabled historical staff', 'disabled'); INSERT INTO regional_coordinator_assignments (user_id, region_number) VALUES ('disabled-rollover', 2); INSERT INTO coach_assignments (user_id, school_id) VALUES ('disabled-rollover', 'school-alpha');"
# Creating a season must leave all persistent and event assignment rows untouched.
assignment_snapshot_sql="SELECT 'admin' AS role, user_id, '' AS scope, created_at FROM statewide_assignments UNION ALL SELECT 'regional', user_id, CAST(region_number AS TEXT), created_at FROM regional_coordinator_assignments UNION ALL SELECT 'coach', user_id, school_id, created_at FROM coach_assignments UNION ALL SELECT 'scorekeeper', user_id, contest_id, created_at FROM scorekeeper_assignments ORDER BY role, user_id, scope;"
assignments_before="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="$assignment_snapshot_sql" | node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8"))[0].results))')"
# Directory changes should govern the new invitations, without changing history.
d1 --command="UPDATE schools SET active = 0 WHERE id = 'school-beta'; UPDATE schools SET division = 2 WHERE id = 'school-alpha';"
assert_status POST '/?/setSeasonStatus' 200 "$coordinator" --data 'seasonId=season-2026&status=archived'
assert_action_failure POST '/?/setSeasonStatus' 400 "$coordinator" --data 'seasonId=season-2026&status=regional'
assert_action_failure POST '/state/contest-state-2026?/setAttendance' 400 "$coordinator" --data 'schoolId=school-alpha&intent=attending'
assert_status POST '/?/createSeason' 200 "$coordinator" --data 'year=2027'
grep --fixed-strings --quiet 'Season created.' "$response_file" || { cat "$response_file" >&2; exit 1; }
bootstrap_check="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT COUNT(*) AS bootstrapped_regions FROM regions r JOIN seasons s ON s.id = r.season_id JOIN contests c ON c.region_id = r.id AND c.season_id = s.id WHERE s.year = 2027 AND c.kind = 'regional' AND c.lifecycle = 'setup' AND c.starts_at IS NULL;")"
[[ "$bootstrap_check" =~ \"bootstrapped_regions\"[[:space:]]*:[[:space:]]*11 ]] || { echo "season bootstrap did not persist eleven regions and contests: $bootstrap_check" >&2; exit 1; }
assert_page_contains GET / "$coordinator" 'Region 11 — Virtual'
assert_page_contains GET / "$coordinator" 'Regional contests are in progress.'
state_bootstrap="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT COUNT(*) AS state_contests FROM contests c JOIN seasons s ON s.id = c.season_id WHERE s.year = 2027 AND c.kind = 'state';")"
[[ "$state_bootstrap" =~ \"state_contests\"[[:space:]]*:[[:space:]]*1 ]] || { echo "season must create exactly one state contest: $state_bootstrap" >&2; exit 1; }

# Rollover preserves regional placement only: active schools, current division,
# fresh invitation status, and no annual roster or state participation.
rollover_check="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="
WITH expected AS (
 SELECT p.school_id, r.number, school.division FROM school_participations p
 JOIN contests c ON c.id = p.contest_id JOIN regions r ON r.id = c.region_id
 JOIN schools school ON school.id = p.school_id
 WHERE c.season_id = 'season-2026' AND c.kind = 'regional' AND school.active = 1
), actual AS (
 SELECT p.school_id, r.number, p.division FROM school_participations p
 JOIN contests c ON c.id = p.contest_id JOIN regions r ON r.id = c.region_id
 JOIN seasons s ON s.id = c.season_id WHERE s.year = 2027
), missing AS (SELECT * FROM expected EXCEPT SELECT * FROM actual),
extra AS (SELECT * FROM actual EXCEPT SELECT * FROM expected)
SELECT (SELECT COUNT(*) FROM missing) + (SELECT COUNT(*) FROM extra) +
 (SELECT COUNT(*) FROM school_participations p JOIN contests c ON c.id = p.contest_id JOIN seasons s ON s.id = c.season_id WHERE s.year = 2027 AND (p.invitation_status <> 'invited' OR c.kind <> 'regional')) +
 (SELECT COUNT(*) FROM annual_students a JOIN seasons s ON s.id = a.season_id WHERE s.year = 2027) AS rollover_errors;")"
[[ "$rollover_check" =~ \"rollover_errors\"[[:space:]]*:[[:space:]]*0 ]] || { echo "school-region rollover failed: $rollover_check" >&2; exit 1; }

assignments_after="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="$assignment_snapshot_sql" | node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8"))[0].results))')"
[[ "$assignments_before" == "$assignments_after" ]] || { echo "season creation changed access assignments" >&2; exit 1; }
assert_page_contains GET /my-schools "$coach" '2027'
# QR disable/enable exercised earlier revoked Gamma's original sessions.
# Start with a valid session so this denial proves assignment removal.
d1 --command="INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES ('persistent-coach-session', 'user-coach-gamma', 4102444800000, 1700000000000, 1700000000000);"
gamma_coach='persistent-coach-session'
assert_page_contains GET /my-schools "$gamma_coach" '2027'
assert_status POST '/admin/users?/removeAssignment' 200 "$coordinator" --data 'userId=user-coach-gamma&assignmentKind=coach&schoolId=school-gamma'
assert_status GET /my-schools 403 "$gamma_coach"
assert_status POST '/admin/users?/add' 200 "$coordinator" --data 'email=coach%40gamma.example&role=coach&schoolId=school-gamma'
assert_page_contains GET /my-schools "$gamma_coach" '2027'

new_regional_contest="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT c.id FROM contests c JOIN regions r ON r.id = c.region_id JOIN seasons s ON s.id = c.season_id WHERE s.year = 2027 AND r.number = 2;" | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s)[0].results[0].id));')"
assert_page_contains GET "/contests/$new_regional_contest" "$regional" 'Region 2'
assert_status POST '/contests/contest-region-2/staff?/remove' 403 "$regional" --data 'role=coach&schoolId=school-gamma&userId=user-coach-gamma'
assert_status POST '/contests/contest-region-2/staff?/qr' 403 "$regional" --data 'userId=user-coach-gamma'

# A scorekeeper's old Region 2 event assignment grants no access to the new one.
d1 --command="INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES ('replacement-session', 'user-scorekeeper-2', 4102444800000, 1700000000000, 1700000000000);"
replacement='replacement-session'
assert_status GET "/scoring/$new_regional_contest" 403 "$replacement"
assert_status GET "/contests/$new_regional_contest" 403 "$replacement"
# Reassignment changes access immediately for existing sessions, across seasons,
# and leaves every existing audit event and result editor untouched.
history_sql="SELECT id, actor_user_id, details_json FROM audit_events WHERE entity_type <> 'access_assignment' ORDER BY id; SELECT entry_id, last_edited_by FROM results ORDER BY entry_id;"
history_before="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="$history_sql" | node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).map(x=>x.results)))')"
assert_status POST '/admin/users?/removeAssignment' 200 "$coordinator" --data 'userId=user-regional-coordinator-2&assignmentKind=regional&regionNumber=2'
assert_status GET "/contests/$new_regional_contest" 403 "$regional"
assert_status GET /contests/contest-region-2 403 "$regional"
assert_status POST '/admin/users?/add' 200 "$coordinator" --data 'email=scorekeeper2%40wsmc.example&role=regional&regionNumber=2'
assert_page_contains GET "/contests/$new_regional_contest" "$replacement" 'Region 2'
assert_page_contains GET /contests/contest-region-2 "$replacement" 'Region 2'
assert_status GET /contests/contest-region-1 403 "$replacement"
history_after="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="$history_sql" | node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).map(x=>x.results)))')"
[[ "$history_before" == "$history_after" ]] || { echo "reassignment changed historical attribution" >&2; exit 1; }
access_audit="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT action, entity_id, actor_user_id, details_json FROM audit_events WHERE entity_type = 'access_assignment' AND json_extract(details_json, '$.kind') = 'regional' AND json_extract(details_json, '$.regionNumber') = 2 ORDER BY created_at;")"
node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"))[0].results; if(r.length!==2 || r[0].action!=="assignment_revoked" || r[0].entity_id!=="user-regional-coordinator-2" || r[1].action!=="assignment_granted" || r[1].entity_id!=="user-scorekeeper-2" || r.some(x=>x.actor_user_id!=="user-coordinator")) throw new Error("Reassignment audit is incomplete");' <<< "$access_audit"


# Season progression is administrator-controlled and shared with the homepage.
new_season_id="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT id FROM seasons WHERE year = 2027;" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8"))[0].results[0].id)')"
assert_action_failure POST '/?/setSeasonStatus' 400 "$coordinator" --data "seasonId=$new_season_id&status=state"
assert_action_failure POST '/?/setSeasonStatus' 400 "$coordinator" --data "seasonId=$new_season_id&status=qualifications"
d1 --command="UPDATE contests SET lifecycle = 'finalized' WHERE season_id = '$new_season_id' AND kind = 'regional';"
assert_status POST '/?/setSeasonStatus' 200 "$coordinator" --data "seasonId=$new_season_id&status=qualifications"
assert_page_contains GET / "$coordinator" 'Administrators are settling state qualifications.'
assert_status POST '/?/setSeasonStatus' 200 "$coordinator" --data "seasonId=$new_season_id&status=state"
assert_page_contains GET / "$coordinator" 'Qualifications are settled.'

echo "authenticated Pages end-to-end preview passed"
