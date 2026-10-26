# Local development and demo preview

## A fresh demo you can use in the browser

From the repository root, with Node.js 20+ installed:

```bash
npm ci
npm run demo:preview
```

Open `http://127.0.0.1:8797/login`. The command builds the app, applies
migrations, and loads the real-school showcase into a temporary local D1.
Ctrl+C removes that database. Restarting restores the showcase. Set
`WSMC_DEMO_PORT=8798` to choose another port. The script rejects email/origin
settings in `.dev.vars` and uses development email, which prints one-time
sign-in links to the terminal. Sign out before switching accounts.

### Sign in and tour

| Role | Email | Starting point |
|---|---|---|
| Statewide coordinator | `coordinator@wsmc.example` | `/program` |
| Spokane coordinator | `regional1@wsmc.example` | `/results/contest-region-1`, finalized and published |
| Tri Cities coordinator | `regional2@wsmc.example` | `/contests/contest-region-2`, registration |
| Northwest coordinator | `regional5@wsmc.example` | `/scoring/contest-region-5`, partial scoring |
| Hanford coach | `coach.hanford@wsmc.example` | `/my-schools`, registration |

Every region has `regionalN@wsmc.example` (1–11, with 11 Virtual). Every school
has `coach.<school-id-without-school-prefix>@wsmc.example`; see
`scripts/data/wsmc-directory-2026.json` for the IDs. All users are fictional.
No scorekeeper accounts or assignments are created. Coordinators enter scores.

Regions 4 and 10 are in setup; 2, 6, 9 and Virtual have registration open;
3 has locked rosters; 5 and 8 have partial scores; 7 is finalized awaiting
publication; 1 is finalized and published. The state contest is in setup,
without premature qualifications or state roster entries. Published regional
results are visible to authorized school users; the state public results
page remains unpublished.

There are 40 real schools, 320 fictional annual students, and eight students
on each participating school's roster outside setup regions. Each rostered
school has a project, Team Contest, Topical Team, five Topical Individuals,
and eight Knowdown entrants. Names and divisions come from the 2026 regional
report; scores and regional contest dates are illustrative. See
[showcase data](showcase-data.md) for provenance and source inconsistencies.

## Persistent Vite development database

```bash
npm run seed:showcase
npm run dev
```

`seed:showcase` **replaces all application data** in the default local D1 under
`.wrangler/state`. It is local-only and applies migrations first. Rerunning
restores the demo, including role accounts and contest states. It never uses
remote D1. The isolated Pages demo uses its own temporary database instead.

`scripts/seed.sql` and `npm run seed` remain the small Alpha/Beta/Gamma
fixture used by automated checks; they are separate from the showcase.

## Checks

With the preview running, `npm run smoke:preview -- http://127.0.0.1:8797`
checks public/private route boundaries without changing demo data. The
following commands use their own local fixtures and do not require your demo
server to be running:

```bash
npm run check
npm test -- --run
npm run test:db
npm run build
npm run test:e2e:preview
npm run rehearsal
```

Run the authenticated end-to-end preview after `npm run build`. It starts a
separate listener on port 8791, creates and removes its own temporary D1,
and tests role access, stage changes, finalization, and publication. If that
port is occupied, set `WSMC_E2E_PORT` to a free port.
