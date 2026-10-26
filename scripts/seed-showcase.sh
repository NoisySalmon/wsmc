#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Local only, by construction. Optional path supports isolated Pages previews.
args=(--local)
if (( $# > 1 )); then echo 'Usage: seed-showcase.sh [local-state-directory]' >&2; exit 1; fi
if (( $# == 1 )); then args+=(--persist-to "$1"); fi
seed_file="$(mktemp "${TMPDIR:-/tmp}/wsmc-showcase-XXXXXX.sql")"
log_file="$(mktemp "${TMPDIR:-/tmp}/wsmc-showcase-log-XXXXXX")"
trap 'rm -f "$seed_file" "$log_file"' EXIT
node scripts/generate-showcase.mjs "$seed_file"
CI=1 npx wrangler d1 migrations apply wsmc-db "${args[@]}"
if ! npx wrangler d1 execute wsmc-db "${args[@]}" --file="$seed_file" >"$log_file" 2>&1; then
	cat "$log_file" >&2
	exit 1
fi
echo "Local showcase loaded. Sign in as coordinator@wsmc.example, regional2@wsmc.example, or coach.hanford@wsmc.example."
