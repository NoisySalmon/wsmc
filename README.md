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

### Prerequisites

- Node.js (v20+)
- Cloudflare Wrangler CLI

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/NoisySalmon/wsmc.git
   cd wsmc
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Initialize the local database:
   ```bash
   npx wrangler d1 migrations apply wsmc-db --local
   npm run seed
   ```

The project enables npm's `ignore-scripts` setting because Wrangler's optional
local image dependency does not provide a Node 26 prebuilt binary. The app and
local D1 workflow do not use that dependency.

4. Start the development server:
   ```bash
   npm run dev
   ```

For the Pages preview with D1 binding, backup/restore, and coordinator
recovery, see the [coordinator workflow](docs/operations/coordinator-workflow.md),
[D1 operations runbook](docs/operations/d1-runbook.md), and [authentication
bootstrap guide](docs/operations/auth-bootstrap.md).

## Verification

Run the complete local gates before a checkpoint commit:

```bash
npm test -- --run
npm run check
npm run build
npm run test:db
npm run test:e2e:preview
```

The authenticated preview journey builds an isolated local D1, provisions
disposable fixture sessions, exercises the regional-to-state route and action
handoff, and removes the temporary database when it finishes. It requires the
production build output and a local Wrangler listener; it never uses remote
D1 or real email tokens.

The same checks run in [GitHub Actions](.github/workflows/ci.yml) for pushes
and pull requests.

## Deployment

The project is configured for Cloudflare Pages.

Before deploying the configured `wsmc` project, confirm that the target D1 is
the disposable database intended for the v2 reset, apply and verify the v2
migration, and configure the production Pages values documented in the
[D1 runbook](docs/operations/d1-runbook.md). The current remote target still
contains the legacy prototype schema and has no production email secrets, so
it has intentionally not been changed.

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
