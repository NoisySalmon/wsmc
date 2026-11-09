#!/usr/bin/env bash
set -euo pipefail

# Fresh, disposable Pages + D1 demo. Stop the server to remove its local data.
cd "$(dirname "$0")/.."

scenario="${1:-showcase}"
if (( $# > 1 )); then echo 'Usage: demo-preview.sh [showcase|first-season|new-season]' >&2; exit 1; fi
case "$scenario" in
 showcase|first-season|new-season) ;;
 *) echo "Unknown scenario: $scenario" >&2; exit 1 ;;
esac
port="${WSMC_DEMO_PORT:-8797}"
if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
	echo "WSMC_DEMO_PORT must be a TCP port from 1 to 65535." >&2
	exit 1
fi

# The demo uses logged, one-time local links. Do not let a local secrets file
# send actual email or direct the callback to another host.
if [[ -f .dev.vars ]] && grep -Eq '^[[:space:]]*(EMAIL_API_KEY|EMAIL_FROM|APP_ORIGIN|ENVIRONMENT)[[:space:]]*=' .dev.vars; then
	echo "Remove EMAIL_API_KEY, EMAIL_FROM, APP_ORIGIN, and ENVIRONMENT from .dev.vars before starting the isolated demo." >&2
	exit 1
fi
unset EMAIL_API_KEY EMAIL_FROM APP_ORIGIN ENVIRONMENT

database_id="$(awk -F '"' '/^[[:space:]]*database_id[[:space:]]*=/ { print $2; exit }' wrangler.toml)"
if [[ -z "$database_id" ]]; then
	echo "Could not read the D1 database ID from wrangler.toml." >&2
	exit 1
fi

state_dir="$(mktemp -d "${TMPDIR:-/tmp}/wsmc-demo-preview-XXXXXX")"
cleanup() { rm -rf "$state_dir"; }
trap cleanup EXIT

npm run build
bash scripts/seed-scenario.sh "$scenario" "$state_dir"

cat <<MESSAGE

Scenario: $scenario
Isolated demo database: $state_dir (removed when this server stops)
Open http://127.0.0.1:$port/login and request a link for one of these fixture accounts:
  State coordinator:    coordinator@wsmc.example
The one-time sign-in link appears in this terminal as a [development email] line.
Sign out before switching accounts. No production D1 or email service is used.

MESSAGE

if [[ "$scenario" == showcase ]]; then
 echo 'Showcase roles: regional1 through regional11 @wsmc.example; coach.hanford@wsmc.example.'
elif [[ "$scenario" == first-season ]]; then
 echo 'No seasons exist. Sign in as the state coordinator and create your first season on Home.'
else
 echo '2026 is archived demo history. Sign in as the state coordinator and create 2027 on Home.'
fi

npx wrangler pages dev .svelte-kit/cloudflare \
	--d1 "DB=$database_id" \
	--binding ENVIRONMENT=development \
	--binding "APP_ORIGIN=http://127.0.0.1:$port" \
	--persist-to "$state_dir" \
	--port "$port"
