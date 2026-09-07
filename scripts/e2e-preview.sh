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
d1 --file=scripts/seed.sql

# Exercise scoring in the open state while retaining the seeded regional and
# qualification records needed by the end-to-end handoff.
d1 --command="UPDATE contests SET lifecycle = 'scoring' WHERE id = 'contest-region-1'; INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES ('e2e-coordinator-session', 'user-coordinator', 4102444800000, 1700000000000, 1700000000000), ('e2e-scorekeeper-session', 'user-scorekeeper', 4102444800000, 1700000000000, 1700000000000);"

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

coordinator="e2e-coordinator-session"
scorekeeper="e2e-scorekeeper-session"

# Anonymous and exact public-route boundaries.
assert_status GET /program 303
assert_status GET /state/contest-state-2026/results 404
assert_status GET /state/contest-state-2026/results/details 303

# A statewide coordinator can traverse the operational handoff and execute a
# real mutation against the isolated database.
assert_status GET /program 200 "$coordinator"
assert_status GET /registration/contest-region-2/school-gamma 200 "$coordinator"
assert_status GET /scoring/contest-region-1 200 "$coordinator"
assert_status GET /qualifications/season-2026 200 "$coordinator"
assert_status GET /state/contest-state-2026 200 "$coordinator"
assert_status GET /reports/season/season-2026 200 "$coordinator"
assert_status POST '/state/contest-state-2026?/setAttendance' 200 "$coordinator" --data 'schoolId=school-alpha&intent=attending'

# Two authenticated score editors can reach the same contest, but a stale
# conditional write is rejected and a scorekeeper cannot finalize.
assert_status GET /scoring/contest-region-1 200 "$scorekeeper"
assert_status POST '/scoring/contest-region-1?/saveResult' 200 "$coordinator" --data 'entryId=entry-r1-team-alpha&expectedVersion=1&score=89'
assert_action_failure POST '/scoring/contest-region-1?/saveResult' 409 "$scorekeeper" --data 'entryId=entry-r1-team-alpha&expectedVersion=1&score=87'
assert_status POST '/scoring/contest-region-1?/finalize' 403 "$scorekeeper" --data ''

# Cross-scope scorekeeper access is denied at the route boundary.
assert_status GET /state/contest-state-2026 403 "$scorekeeper"
attendance_check="$(npx wrangler d1 execute wsmc-db --local --persist-to "$persist_dir" --json --command="SELECT intent FROM state_attendances WHERE contest_id = 'contest-state-2026' AND school_id = 'school-alpha';")"
[[ "$attendance_check" == *attending* ]] || { echo "attendance mutation was not persisted: $attendance_check" >&2; exit 1; }

echo "authenticated Pages end-to-end preview passed"
