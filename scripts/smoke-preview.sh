#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-http://127.0.0.1:8790}"
base_url="${base_url%/}"
state_contest_id="${WSMC_SMOKE_STATE_CONTEST_ID:-contest-state-2026}"
public_results_status="${WSMC_SMOKE_PUBLIC_RESULTS_STATUS:-404}"

status_for() {
	local method="$1"
	local path="$2"
	curl --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' --request "$method" "${base_url}${path}"
}

assert_status() {
	local method="$1"
	local path="$2"
	local expected="$3"
	local actual
	actual="$(status_for "$method" "$path")"
	if [[ "$actual" != "$expected" ]]; then
		echo "smoke check failed: $method $path returned $actual (expected $expected)" >&2
		exit 1
	fi
	echo "smoke check passed: $method $path -> $actual"
}

assert_status GET /login 200
assert_status GET /program 303
assert_status POST /program 401
assert_status GET "/state/${state_contest_id}/results" "$public_results_status"
assert_status GET "/state/${state_contest_id}/results/details" 303

echo "Pages smoke checks passed for ${base_url}"
