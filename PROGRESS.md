# WSMC Regional Math Contest — Build Progress

## Milestone 1 — Skeleton + Schema
**Status:** ✅ Complete

### Checklist
- [x] Scaffold SvelteKit project with Cloudflare Pages adapter
- [x] Install & configure Drizzle ORM with D1 binding
- [x] Define all database tables in Drizzle schema
- [x] Run migrations against local D1
- [x] Seed with one contest + 2-3 schools from the spreadsheet
- [x] `npm run dev` serves a page
- [x] Schema exists in D1, seed data queryable

### Key Files
- `src/lib/server/db/schema.ts` — All 11 tables: contests, schools, students, teams, team_members, project_scores, team_problem_scores, topical_team_scores, topical_individual_scores, knowdown_results, users
- `src/lib/server/db/index.ts` — DB helper (`getDb(d1)`)
- `src/app.d.ts` — Platform types (D1 binding)
- `drizzle.config.ts` — Drizzle config
- `wrangler.toml` — Cloudflare Workers config with D1 binding
- `drizzle/0000_woozy_bruce_banner.sql` — Generated migration
- `scripts/seed.sql` — Seed data: 1 contest, 5 schools (3 Div 1, 2 Div 2), 14 students, 9 teams with members
- `src/routes/+page.server.ts` + `+page.svelte` — Landing page showing contest/school/student summary

### Notes for Milestone 2
- No auth yet — all pages are open. Platform env accessed via `platform!.env.DB`.
- `$defaultFn(() => crypto.randomUUID())` handles ID generation in Drizzle (runs at insert time).
- Seed uses deterministic UUIDs (e.g. `c1000000-...`, `s1000000-...`) for easy cross-referencing.
- To re-seed: drop local D1 state (`.wrangler/state/v3/d1/`), re-run `npx wrangler d1 migrations apply wsmc-db --local`, then `npm run seed`.
- The `adapter-auto` package is still in devDependencies but unused (swapped to `adapter-cloudflare`). Can remove.

---

## Milestone 2 — Contest & School Management (Coordinator)
**Status:** ✅ Complete

### Checklist
- [x] Contest list page (`/contests`) with create form
- [x] Contest detail page (`/contests/[contestId]`) with edit form + status control + delete
- [x] School list on contest detail page
- [x] Add school page (`/contests/[contestId]/schools/new`) with full form (name, short name, division, coach info, address)
- [x] Edit school page (`/contests/[contestId]/schools/[schoolId]`) with update + delete
- [x] Global nav layout with WSMC branding
- [x] Home page redirects to `/contests`

### Routes
- `GET /contests` — list contests + create form
- `POST /contests?/create` — create contest → redirect to detail
- `GET /contests/[contestId]` — contest detail + school table
- `POST /contests/[contestId]?/update` — update contest
- `POST /contests/[contestId]?/delete` — delete contest → redirect to list
- `GET /contests/[contestId]/schools/new` — add school form
- `POST /contests/[contestId]/schools/new` — create school → redirect to contest
- `GET /contests/[contestId]/schools/[schoolId]` — edit school form
- `POST .../[schoolId]?/update` — update school
- `POST .../[schoolId]?/delete` — delete school → redirect to contest

### Notes for Milestone 3
- No auth — all routes are open. Coordinator/coach distinction deferred to M6.
- Forms use SvelteKit form actions (server-side, progressive enhancement).
- Svelte 5 runes mode: event handlers must be JS expressions, not strings (`onclick={(e) => ...}` not `onclick="..."`).
- DB access pattern: `const db = getDb(platform!.env.DB)` in every load/action.
- School delete does not cascade-delete students/teams yet (FK constraints will block if children exist). May need cascade or explicit cleanup in M3.

---

## Milestone 3 — Student Entry & Team Formation (Coach)
**Status:** ✅ Complete

### Checklist
- [x] Student CRUD (add/edit/delete) with grade and competing grade
- [x] Play-up validation (competing_grade ≥ actual_grade)
- [x] Knowdown toggle with max-3-per-school enforcement
- [x] Team creation per contest type (project, team_problem, topical)
- [x] Add/remove students to/from teams
- [x] Team validation: max 3 members, different competing grades, one team per type per student
- [x] Topical individual vs team mode (automatic — students not on topical team are individual)
- [x] Summary sections: Topical Individual Competitors, Knowdown Competitors
- [x] Validation logic extracted to `src/lib/validation.ts` (pure functions, no DB)
- [x] 17 unit tests for all validation rules passing

### Key Files
- `src/lib/validation.ts` — Pure validation functions (testable, no DB deps)
- `src/lib/__tests__/validation.test.ts` — 17 tests covering all rules
- `src/routes/contests/[contestId]/schools/[schoolId]/+page.server.ts` — 9 form actions (addStudent, updateStudent, deleteStudent, toggleKnowdown, createTeam, addToTeam, removeFromTeam, deleteTeam, update)
- `src/routes/contests/[contestId]/schools/[schoolId]/+page.svelte` — Full school management hub

### Form Actions on School Page
- `?/addStudent` — add student with grade validation
- `?/updateStudent` — edit name/grades via inline popover
- `?/deleteStudent` — remove student (cleans up team memberships)
- `?/toggleKnowdown` — toggle knowdown flag (max 3 enforced)
- `?/createTeam` — create new numbered team for a contest type
- `?/addToTeam` — assign student to team (full validation)
- `?/removeFromTeam` — remove student from team
- `?/deleteTeam` — delete team and all memberships
- `?/update` — update school info (carried from M2)

### Notes for Milestone 4
- Teams + members are loaded in the page load with full member details (name, competing grade).
- The `availableForTeam()` client helper filters the student dropdown to only show eligible students.
- Topical individual competitors are derived automatically (students NOT on any topical team).
- Deleting a student cascades: removes from team_members first, then deletes student.
- No topical score exclusivity enforcement at the DB level yet — enforced in UI by showing team vs individual mode.

---

## Milestone 4 — Score Entry (Coordinator)
**Status:** ✅ Complete

### Checklist
- [x] Score entry page at `/contests/[contestId]/scores` with tabbed UI
- [x] Project scores: bulk table entry, one score per team
- [x] Team Problem scores: bulk table entry, one score per team
- [x] Topical Team scores: Part 1 + Part 2 entry with auto-calculated total
- [x] Topical Individual scores: Part 1 + Part 2 per student, grouped by grade
- [x] Knowdown results: select 1st–4th place from eligible students
- [x] All scores upsert (insert or update) — clearing a field removes the score
- [x] Scores persist and show up when re-visiting the page
- [x] Link to score entry from contest detail page

### Key Files
- `src/routes/contests/[contestId]/scores/+page.server.ts` — Load function (teams, students, existing scores) + 5 form actions (saveProjectScores, saveTeamProblemScores, saveTopicalTeamScores, saveTopicalIndividualScores, saveKnowdown)
- `src/routes/contests/[contestId]/scores/+page.svelte` — Tabbed score entry UI with bulk table views

### Routes
- `GET /contests/[contestId]/scores` — score entry page with 5 tabs
- `POST ?/saveProjectScores` — upsert project scores
- `POST ?/saveTeamProblemScores` — upsert team problem scores
- `POST ?/saveTopicalTeamScores` — upsert topical team scores (part1 + part2)
- `POST ?/saveTopicalIndividualScores` — upsert topical individual scores (part1 + part2)
- `POST ?/saveKnowdown` — save 1st–4th place knowdown results

### Notes for Milestone 5
- Score data is fully queryable from the DB for leaderboard computation.
- Topical individuals are derived the same way as M3: students NOT on any topical team.
- Knowdown results are stored per-contest with place (1–4) and student_id.
- The tab UI remembers which tab you were on after saving (via `form.tab`).
- No score validation beyond numeric parsing — coordinator manually handles ties per spec.

---

## Milestone 5 — Leaderboards & Awards
**Status:** ✅ Complete

### Checklist
- [x] Leaderboard page at `/contests/[contestId]/leaderboard` with 6 tabs
- [x] Project Rankings — teams ranked by score, per division
- [x] Team Problem Rankings — teams ranked by score, per division
- [x] Topical Team Rankings — teams ranked by total (Part 1 + Part 2), per division
- [x] Topical Individual Rankings — students ranked by total, grouped by grade, per division
- [x] Knowdown Results — 1st through 4th with emoji place labels
- [x] Distinguished Students — top individual per grade/division not on a top-3 topical team
- [x] Division filter (All / Division 1 / Division 2) across all tabs
- [x] Tie handling (equal scores get same rank)
- [x] Top-3 row highlighting
- [x] Pure ranking functions in `src/lib/rankings.ts` (no DB deps)
- [x] 9 unit tests for ranking logic
- [x] Seed data expanded: all 5 schools now have students, teams, and scores
- [x] Link to leaderboard from contest detail page

### Key Files
- `src/lib/rankings.ts` — Pure ranking functions: `rankByScore`, `rankIndividuals`, `computeDistinguished`
- `src/lib/__tests__/rankings.test.ts` — 9 tests covering ranking, ties, filtering, distinguished logic
- `src/routes/contests/[contestId]/leaderboard/+page.server.ts` — Load all scores, compute rankings + distinguished
- `src/routes/contests/[contestId]/leaderboard/+page.svelte` — 6-tab leaderboard UI with division filter
- `scripts/seed.sql` — Expanded: HHS + CLHS students/teams, all score types seeded

### Routes
- `GET /contests/[contestId]/leaderboard` — read-only leaderboard with 6 tabs

### Notes for Milestone 6
- Rankings are computed client-side from server-loaded score data (no separate API).
- Distinguished student logic: for each grade+division, finds top individual whose topical team did NOT place top 3 in that division's topical team rankings.
- Knowdown is cross-division (single bracket), not filtered by division.
- All ranking functions are pure and tested independently of the DB.

---

## Milestone 6 — Auth & Roles
**Status:** ⬜ Not Started

---

## Milestone 7 — Polish & Deploy
**Status:** ⬜ Not Started
