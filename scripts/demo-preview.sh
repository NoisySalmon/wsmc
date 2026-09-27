#!/usr/bin/env bash
set -euo pipefail

# Fresh, disposable Pages + D1 demo. Stop the server to remove its local data.
cd "$(dirname "$0")/.."

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
CI=1 npx wrangler d1 migrations apply wsmc-db --local --persist-to "$state_dir"
npx wrangler d1 execute wsmc-db --local --persist-to "$state_dir" --file=scripts/seed.sql
npx wrangler d1 execute wsmc-db --local --persist-to "$state_dir" \
	--command="INSERT INTO scorekeeper_assignments (user_id, contest_id) VALUES ('user-scorekeeper', 'contest-region-2');"

cat <<MESSAGE

Isolated demo database: $state_dir (removed when this server stops)
Open http://127.0.0.1:$port/login and request a link for one of these fixture accounts:
  State coordinator:    coordinator@wsmc.example
  Region 1 coordinator: regional@wsmc.example
  Region 2 coordinator: regional2@wsmc.example
  Coach:                coach@gamma.example
  Scorekeeper:          scorekeeper@wsmc.example
The one-time sign-in link appears in this terminal as a [development email] line.
Sign out before switching accounts. No production D1 or email service is used.

MESSAGE

npx wrangler pages dev .svelte-kit/cloudflare \
	--d1 "DB=$database_id" \
	--binding ENVIRONMENT=development \
	--binding "APP_ORIGIN=http://127.0.0.1:$port" \
	--persist-to "$state_dir" \
	--port "$port"
