# Script index

Run commands from the repository root after `npm ci`. Use `npm run` to list
the available npm commands; their definitions live in [package.json](../../package.json).
Pass script arguments after `--`, as in `npm run demo:scores -- --contest contest-region-5`.

## Development and previews

| Command | Purpose and target |
|---|---|
| `npm run dev` | Start Vite using the persistent local D1 database. Existing local data is retained. |
| `npm run build` | Build the Cloudflare Pages app; required before the authenticated end-to-end preview. |
| `npm run preview` | Preview an existing Vite build. |
| `npm run demo:preview -- [showcase\|first-season\|new-season]` | Build and start a Pages demo with a disposable local database. Defaults to `showcase`; deletes its database on exit. |
| `npm run prepare` | Regenerate SvelteKit files; also configured as npm's prepare lifecycle command. |

See [local development](local-development.md) for demo accounts, URLs, ports,
and persistent versus disposable databases.

## Seeds and local restoration

Stop other processes writing to the local database before replacing its data.

| Command | Effect |
|---|---|
| `npm run seed:showcase` | Apply migrations and replace all local app data with the 40-school fictional showcase. |
| `npm run seed:first-season` | Replace local data with the school directory and administrator, without a season. |
| `npm run seed:new-season` | Replace local data with archived 2026 showcase history, ready to create a new season. |
| `npm run seed:state-registration` | Restore the entire local database from `.local/snapshots/state-2026-state-registration.sqlite`. Requires that private, untracked snapshot and exactly one local database. Backs up the previous database beside the snapshot. |
| `npm run seed` | Insert the small Alpha/Beta/Gamma SQL fixture into local D1. Does not apply migrations or reset existing records; intended for an empty, migrated database. |
| `npm run seed:remote` | Insert that same small test fixture into **remote D1**. This is not a production bootstrap command. Follow the [D1 runbook](d1-runbook.md) for production work. |

The three scenario seeds accept an optional state directory:
`npm run seed:showcase -- /path/to/state`. Detailed scenarios are in
[local development](local-development.md); directory provenance and production
bootstrap instructions are in [showcase data](showcase-data.md).

## Fast-forward helpers

These commands access only local showcase data and refuse databases without
the fictional showcase identity. They do not operate on the private restored
snapshot or remote D1. All accept `--persist-to /path/to/state` to use the same
directory passed to a scenario seed.

| Command | Effect |
|---|---|
| `npm run demo:scores -- --contest CONTEST_ID` | Fill missing scores in a locked/scoring contest; preserve existing scores and finalized contests. |
| `npm run demo:regionals -- [--exclude CONTEST_ID ...]` | Populate untouched regional registrations, fill scores, finalize and publish. Repeat `--exclude` to leave contests for a live demo. Does not advance the season stage. |
| `npm run demo:attendance -- --intent attending` | During open state registration, save current worksheets for undecided schools. Skip decided and withdrawn schools. |
| `npm run demo:attendance -- --intent not_attending` | During open state registration, save undecided schools' worksheets with every student marked not attending. Skip decided and withdrawn schools. |
| `npm run demo:complete` | Continue through regionals, qualification publication, state registration, ad-hoc generation, and published state results. |

Score-generating commands accept `--seed TEXT` for deterministic generated scores.
Attendance selects the showcase state contest automatically and optionally accepts
`--contest CONTEST_ID`. It does not advance stages or lock rosters. Run
`node scripts/showcase-tools.mjs --help` for argument syntax, or see the
[demo controls](showcase-data.md#demo-controls) for details.

## Verification

| Command | Coverage and prerequisites |
|---|---|
| `npm run check` | Svelte and TypeScript diagnostics. |
| `npm run check:watch` | Keep those diagnostics running as files change. |
| `npm test -- --run` | Vitest suite, including isolated local D1 tests. |
| `npm run test:db` | SQLite schema, fixture, backup/restore, migration and archive checks. Requires `sqlite3` and Python. Uses disposable databases. |
| `npm run test:qualifications` | Synthetic qualification and state-registration journey against isolated D1. |
| `npm run rehearsal` | Disposable SQLite rehearsal with 24 schools, 241 students, concurrent score corrections, and administrator recovery. Requires `sqlite3`. |
| `npm run test:e2e:preview` | Authenticated HTTP journey against a disposable Pages worker and D1. Run after `npm run build`; uses port 8791 unless `WSMC_E2E_PORT` is set. |
| `npm run test:showcase` | Disposable showcase CLI journey: score preservation, exclusions, bulk attendance, repeat runs, and published state results. |
| `npm run smoke:preview -- URL` | Check public/private route boundaries on an already running local preview or deployment. No authenticated mutations. Defaults to `http://127.0.0.1:8790`. |

For smoke checks, set `WSMC_SMOKE_STATE_CONTEST_ID` to the target state contest
and `WSMC_SMOKE_PUBLIC_RESULTS_STATUS` to its expected public-results HTTP status
(default `404`). See the [D1 runbook](d1-runbook.md) for deployment checks and
the [root README](../../README.md#verification) for checkpoint gates.

## Underlying scripts and data

Prefer the npm commands above for routine use.

| File | Role |
|---|---|
| [demo-preview.sh](../../scripts/demo-preview.sh) | Disposable Pages demo runner. |
| [seed-scenario.sh](../../scripts/seed-scenario.sh) | Local migration and scenario replacement runner. |
| [seed-showcase.sh](../../scripts/seed-showcase.sh) | Wrapper selecting the showcase scenario. |
| [generate-showcase.mjs](../../scripts/generate-showcase.mjs) | Generate SQL without connecting to a database: `node scripts/generate-showcase.mjs OUTPUT.sql [showcase\|first-season\|new-season]`. Scenario SQL replaces app data when executed. `--directory OUTPUT.sql` instead generates additive directory bootstrap SQL for review. |
| [restore-state-registration.py](../../scripts/restore-state-registration.py) | Private snapshot restoration and local backup helper. |
| [showcase-tools.mjs](../../scripts/showcase-tools.mjs) | Implement the score, regional, attendance and complete helpers through application services. |
| [seed.sql](../../scripts/seed.sql) | Small synthetic Alpha/Beta/Gamma fixture. |
| [reset-v2.sql](../../scripts/reset-v2.sql) | Destructive local fixture reset, embedded in generated scenario SQL. Never use against production. |
| [data/wsmc-directory-2026.json](../../scripts/data/wsmc-directory-2026.json) | School and region source data for scenario generation. |
| [test-v2-db.sh](../../scripts/test-v2-db.sh) | Implement `test:db`; also run the Python migration checks. |
| [test-program-migration.py](../../scripts/test-program-migration.py) | SQLite legacy upgrade and archive-protection checks, normally invoked by `test:db`. |
| [test-qualification-workflow.mjs](../../scripts/test-qualification-workflow.mjs) | Implement `test:qualifications`. |
| [dress-rehearsal.sh](../../scripts/dress-rehearsal.sh) | Implement `rehearsal`. |
| [e2e-preview.sh](../../scripts/e2e-preview.sh) | Implement the authenticated HTTP journey, including the QR helper below. |
| [qr-sign-in-journey.mjs](../../scripts/qr-sign-in-journey.mjs) | QR sign-in subjourney; requires the disposable worker and fixture directory created by `e2e-preview.sh`. |
| [test-showcase-tools.mjs](../../scripts/test-showcase-tools.mjs) | Implement `test:showcase`. |
| [smoke-preview.sh](../../scripts/smoke-preview.sh) | Implement `smoke:preview`. |
