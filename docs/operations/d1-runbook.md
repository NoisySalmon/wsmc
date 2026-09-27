# D1 operations runbook

The v2 schema is append-only after the baseline migration. The local seed is
disposable; production backups must be kept outside the repository and access
controlled as student data.

## Run an isolated local demo

Use `npm run demo:preview` after `npm ci`. It builds a Pages preview, applies
all migrations, seeds a fresh temporary D1, and prints the local sign-in
instructions. The database is removed when the server stops. See the
[local development guide](local-development.md) for the role accounts and
hands-on walkthrough.

## Apply migrations and seed the default local database

```bash
npx wrangler d1 migrations apply wsmc-db --local
npm run seed
npm run test:db
npm run rehearsal
```

The disposable rehearsal scales the local seed to 24 schools and 240 annual
students, verifies the regional-to-state handoff, adds a second scorekeeper,
replays a stale concurrent score edit, and exercises the system-coordinator
recovery shape. It creates a temporary SQLite database and never changes a
remote D1.

These commands use Wrangler's default `.wrangler/state`. Seed only once on a
fresh database; the isolated demo above is easier to reset. With the demo
running, use `npm run smoke:preview -- http://127.0.0.1:8797`. Run
`npm run build` followed by `npm run test:e2e:preview` for the automated
authenticated journey.

`test:e2e:preview` starts its own disposable Pages preview on port 8791,
seeds an isolated D1, creates fixture sessions for statewide and regional
coordinators, a coach, and a scorekeeper, and removes the temporary state
afterward. It verifies the contest overview, stage changes, score coverage,
finalization, publication access, state attendance, scorekeeper scope, and
stale score rejection. Run it after `npm run build`; it does not touch the
persistent preview above or any remote database.

## Configure production email

Set these Pages environment values for the production deployment:

- `ENVIRONMENT=production`
- `APP_ORIGIN=https://<the-public-wsmc-host>`
- `EMAIL_FROM=WSMC <noreply@<verified-domain>>`
- `EMAIL_API_KEY` as an encrypted secret for the Resend API

The isolated local preview sets `ENVIRONMENT=development` and uses the
development adapter, which logs disposable links for testing. A production
environment without both email credentials fails closed instead of logging a
sign-in link.

## Production deployment preflight

The configured Pages project is `wsmc` at `wsmc.pages.dev`. The production
database already runs the v2 baseline with the demo fixture. Before deploying
this local change, export the production D1, apply
`0002_knowdown_outcomes.sql`, and verify that existing Knowdown placements
were backfilled as `placed`. The production Pages environment has the required
email settings and encrypted key; verify them again during deployment review.

After those prerequisites are verified, deploy the built Pages output and run
the post-deploy smoke command below. The current remote target has not been
modified by local development or verification commands.

```bash
npx wrangler pages deploy .svelte-kit/cloudflare
npm run smoke:preview -- https://wsmc.pages.dev
```

## Backup and restore

Run a remote export from a trusted operator machine before migrations or a live
contest. Use a dated path with restricted permissions; never commit the file.

```bash
umask 077
npx wrangler d1 export wsmc-db --remote --output ./wsmc-db-$(date +%Y%m%d-%H%M%S).sql
```

To restore into a new or disposable local database, apply the migrations and
execute the reviewed SQL export:

```bash
npx wrangler d1 migrations apply wsmc-db --local
npx wrangler d1 execute wsmc-db --local --file ./wsmc-db-YYYYMMDD-HHMMSS.sql
npm run test:db
```

For production recovery, create a new D1 database, restore into it, run the
integration checks, then update the Pages binding only after an operator has
verified counts, coordinator access, and publication state. Do not overwrite
the only production copy during an incident.

## Coordinator recovery

Use [auth-bootstrap.md](auth-bootstrap.md) from a trusted machine to create or
recover the first system coordinator. Revoke temporary system access after a
normal coordinator assignment is confirmed. If an administrator account is
disabled, use the same reviewed SQL procedure to create a new active bootstrap
account; do not reuse a sign-in token or copy one from logs.

## Incident checklist

1. Record the UTC time, affected contest, and last known good backup.
2. Pause contest lifecycle mutations and preserve the audit trail.
3. Export the current D1 before attempting repair.
4. Restore into an isolated database and run `npm run test:db` plus the smoke
   checks in the deployment environment.
5. Verify the coordinator can sign in, published qualification rounds remain
   frozen, and published state results contain no roster/contact fields.
6. Switch the binding during a maintenance window and run the post-deploy
   smoke test. `npm run smoke:preview -- https://<deployed-host>` checks the
   login page, private-route protection, unauthenticated POST rejection, and
   the public-results boundary without logging in or changing contest data.
   Set `WSMC_SMOKE_STATE_CONTEST_ID` to a real state contest ID and
   `WSMC_SMOKE_PUBLIC_RESULTS_STATUS=200` after that contest is published;
   the defaults target the disposable seeded, unpublished state contest.

Do not log sign-in tokens, full student rosters, or unnecessary contact data in
incident tickets.
