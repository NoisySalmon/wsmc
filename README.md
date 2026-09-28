# Washington State Math Council (WSMC) Contest Administration

WSMC is a passwordless, statewide contest administration application for
season setup, school participation, mobile registration, CSV interoperability,
regional and state scoring, qualification review, and publication. It is built
with SvelteKit, Drizzle ORM, and Cloudflare D1.

The product requirements, architecture decisions, execution plan, and current
implementation status are tracked in [Product Requirements](docs/product-requirements.md),
[Execution Plan](docs/execution-plan.md), [v2 architecture decisions](docs/adr/0001-v2-foundation.md),
and [implementation progress](docs/implementation-progress.md).

## Features

- **Program administration:** Seasons, numbered regions, contests, school directory, participation, and assignments.
- **Secure registration:** Passwordless sign-in, annual students, explicit contest rosters, category entries, and mobile workflows.
- **CSV interoperability:** Versioned, formula-safe registration, score, state-roster, and administrative report exports/imports.
- **Contest operations:** Category-aware scoring, optimistic concurrency, finalization, publication, qualification snapshots, state attendance, and substitutions.
- **Scoped visibility:** Assignment-based authorization and a publication-gated public state results page.

## Tech Stack

- **Frontend:** SvelteKit (Svelte 5)
- **Database:** Cloudflare D1 (SQLite)
- **ORM:** Drizzle ORM
- **Deployment:** Cloudflare Pages

## Getting Started

### Run the isolated demo locally

Install Node.js 20+ and the repository dependencies, then start a fresh Pages
preview with its own local D1 database:

```bash
git clone https://github.com/NoisySalmon/wsmc.git
cd wsmc
npm ci
npm run demo:preview
```

Open `http://127.0.0.1:8797/login`. Request a sign-in link for
`coordinator@wsmc.example` (statewide administrator),
`regional@wsmc.example` (Region 1 coordinator and Alpha coach),
`regional2@wsmc.example` (Region 2 coordinator),
`coach@gamma.example`, or `scorekeeper@wsmc.example`. The local email adapter prints each one-time link
in the server terminal. Open it in your browser, and sign out before changing
roles. These are fictional fixture users; `natpeterson@gmail.com` is not in
this isolated database.

The command builds the app, applies all D1 migrations, loads `scripts/seed.sql`,
adds Region 2 access for the regional coordinator and scorekeeper, and starts
Wrangler Pages on port 8797. It uses a fresh temporary database and deletes it
when the server stops. Set `WSMC_DEMO_PORT=8798` if that port is occupied.
Nothing is read from or written to production D1. See the
[local development guide](docs/operations/local-development.md) for the exact
configuration, tour URLs, a persistent Vite development option, and tests.

The project enables npm's `ignore-scripts` setting because Wrangler's optional
local image dependency does not provide a Node 26 prebuilt binary. The app and
local D1 workflow do not use that dependency.

## Verification

Run the complete local gates before a checkpoint commit:

```bash
npm test -- --run
npm run check
npm run build
npm run test:db
npm run rehearsal
npm run test:e2e:preview
```

The authenticated preview journey creates its own temporary D1 and fixture
sessions, exercises the regional-to-state route and action handoff, and removes
that database when it finishes. Run it after `npm run build`; it starts its own
Wrangler listener and never uses remote D1 or real email tokens.

The same checks run in [GitHub Actions](.github/workflows/ci.yml) for pushes
and pull requests.

## Deployment

The project is configured for Cloudflare Pages.

The production D1 already has the v2 demo fixture. Before deploying these
local changes, back it up, apply the Knowdown outcome migration, and follow
the production checks in the [D1 runbook](docs/operations/d1-runbook.md).

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy:
   ```bash
   npx wrangler pages deploy .svelte-kit/cloudflare
   ```

3. Run the post-deploy smoke test with the real state contest ID and expected
   publication status:
   ```bash
   npm run smoke:preview -- https://wsmc.pages.dev
   ```

## License

MIT License - see [LICENSE](LICENSE) for details.
