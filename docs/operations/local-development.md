# Local development and demo preview

## Recommended: persistent local development

Run `npm run dev` and open `http://127.0.0.1:5173`. Existing showcase data
and rehearsal edits persist across restarts. Only run `npm run seed:showcase`
when you intentionally want to replace all local data with a fresh showcase.

Reusable sign-in links switch directly between the three demo roles:

- [State admin](http://127.0.0.1:5173/auth/demo/state)
- [Northwest regional admin](http://127.0.0.1:5173/auth/demo/regional)
- [Hanford coach](http://127.0.0.1:5173/auth/demo/coach)

These shortcuts work only on a loopback Vite development server, use the
existing fixture accounts, and are disabled in production builds. No emailed
token or manual sign-out is needed.

## Starting scenarios

These commands replace **all** default local application data, including sessions
and any rehearsal edits. Stop the development server before switching, then run
`npm run dev` and use the state admin shortcut above.

```bash
npm run seed:showcase      # Restore the original mixed regional baseline
npm run seed:first-season  # 40 schools + system administrator; no seasons
npm run seed:new-season    # Archived 2026 showcase history; no current season
```

For either season-creation scenario, sign in as `coordinator@wsmc.example`
and open Home. Create 2026 for a first season, or 2027 after the archived season.
The app creates the 11 regional contests and state contest. Active schools inherit their regional placements from the most recent earlier
season, with fresh invitations and current school divisions. Active regional coordinators and coaches also carry forward; coaches of inactive
schools are excluded. Students and scorekeeper assignments start fresh.
`first-season` has only the administrator account. `new-season` retains the
showcase's fictional users and annual records as read-only history; its mixed
contest states are demo history, not a fully completed competition.
All three seeds are local-only and can be rerun, including after archiving or
creating additional seasons. `seed:showcase` always restores the original baseline.

## Optional: disposable preview

This separate environment is not needed for normal demo rehearsals.

From the repository root, with Node.js 20+ installed:

```bash
npm ci
npm run demo:preview                     # Defaults to showcase
npm run demo:preview -- first-season
npm run demo:preview -- new-season
```

Open `http://127.0.0.1:8797/login`. The command builds the app, applies
migrations, and loads the selected scenario into a temporary local D1.
Ctrl+C removes that database. Restarting restores the selected scenario. The default development database is untouched. Set
`WSMC_DEMO_PORT=8798` to choose another port. The script rejects email/origin
settings in `.dev.vars` and uses development email, which prints one-time
sign-in links to the terminal. Sign out before switching accounts.

### Sign in and tour

| Role | Email | Starting point |
|---|---|---|
| Statewide coordinator | `coordinator@wsmc.example` | `/` |
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
