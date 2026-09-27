# Local development and demo preview

## A fresh demo you can use in the browser

From the repository root, with Node.js 20+ installed:

```bash
npm ci
npm run demo:preview
```

Open `http://127.0.0.1:8797/login`. The script builds the Cloudflare Pages
output, creates a new temporary D1, applies all migrations from `drizzle/`
(including `0002_knowdown_outcomes.sql`), loads `scripts/seed.sql`, adds the
regional coordinator and scorekeeper to Region 2, and starts `wrangler pages
dev` with that D1 bound as `DB`. It prints the temporary directory. Ctrl+C
stops the server and removes the directory. Running it again restores the
original fixture. This preview does not use `.wrangler/state` or remote D1.

If port 8797 is occupied, run `WSMC_DEMO_PORT=8798 npm run demo:preview` and
use that port in the browser. The script rejects `.dev.vars` settings that
could send real email or point sign-in links at another host. It forces a
development origin for the chosen port.

### Sign in as each role

Enter one of these seeded addresses on `/login`. The local email adapter
prints a `[development email]` line with a one-time link in the server
terminal. Open the link in the same browser. Sign out to switch accounts. Do
not copy the link into a report or commit it.

| Role | Fixture email | Useful starting point |
|---|---|---|
| Statewide administrator | `coordinator@wsmc.example` | `/program` → Region 1 contest overview → Results |
| Regional coordinator | `regional@wsmc.example` | `/contests/contest-region-2` → Lock rosters → Start scoring |
| Coach | `coach@gamma.example` | `/my-schools` → Gamma registration for Region 2 |
| Scorekeeper | `scorekeeper@wsmc.example` | `/scoring/contest-region-2` after the coordinator starts scoring |

Use the coach account before locking Region 2 rosters if you want to edit
registration. Region 1 is already finalized: its overview shows two schools,
six rostered students, thirteen entries, and a six entrant Knowdown field.
`/results/contest-region-1` shows four places (fourth is **Alt**) and two
eliminated entrants. Coaches cannot see those results until a coordinator
publishes them. Region 2 begins in `registration_open` with five entries and
no scores. Opening its scoring URL before roster lock returns a stage message
instead of a 500.

The fixture addresses use `.example`; `natpeterson@gmail.com` is not a user in
this temporary database. The local review used disposable authenticated
sessions for automated role checks. Manual testing uses the normal one-time
link flow described above.

## Vite development server

For hot reload while editing source files, use the default local D1 state:

```bash
npx wrangler d1 migrations apply wsmc-db --local
npm run seed
npm run dev
```

Run `npm run seed` only for a fresh local D1; repeating it on seeded data
causes duplicate IDs. Vite uses the default `.wrangler/state`, which is
separate from the temporary demo preview. It also prints local sign-in links
to its terminal. `npm run dev` alone does not create the schema or fixture.
Use `npm run demo:preview` when you want a clean, reproducible tour or to
verify Pages behavior.

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
