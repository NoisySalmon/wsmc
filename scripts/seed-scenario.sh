#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
scenario="${1:-}"
case "$scenario" in
 showcase|first-season|new-season|2026-results) ;;
 *) echo 'Usage: seed-scenario.sh {showcase|first-season|new-season|2026-results} [local-state-directory]' >&2; exit 1 ;;
esac
shift
# Local only, by construction. Optional path supports isolated Pages previews.
args=(--local)
if (( $# > 1 )); then echo 'Usage: seed-scenario.sh SCENARIO [local-state-directory]' >&2; exit 1; fi
if (( $# == 1 )); then args+=(--persist-to "$1"); fi
seed_file="$(mktemp "${TMPDIR:-/tmp}/wsmc-showcase-XXXXXX.sql")"
log_file="$(mktemp "${TMPDIR:-/tmp}/wsmc-showcase-log-XXXXXX")"
trap 'rm -f "$seed_file" "$log_file"' EXIT
if [[ "$scenario" == 2026-results ]]; then
 node scripts/generate-2026-results.mjs "$seed_file" scripts/data/2026-regionals/seed-report.json
else
 node scripts/generate-showcase.mjs "$seed_file" "$scenario"
fi
CI=1 npx wrangler d1 migrations apply wsmc-db "${args[@]}"
if ! npx wrangler d1 execute wsmc-db "${args[@]}" --file="$seed_file" >"$log_file" 2>&1; then
	cat "$log_file" >&2
	exit 1
fi
echo "Local $scenario loaded (all previous app data replaced). Sign in as coordinator@wsmc.example."
