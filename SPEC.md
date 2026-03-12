# WSMC Regional Math Contest — Webapp Specification

## Overview

A web application to replace the Excel-based scoring system for WSMC (Washington State Mathematics Council) regional math contests. The app manages school registration, student/team entry, score recording, and automated leaderboard/award calculation.

---

## 1. Domain Model

### 1.1 Contest

A single regional contest event.

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| region | integer | e.g. 5 |
| year | integer | e.g. 2026 |
| name | string | e.g. "Region 5 WSMC Regional" |
| contest_chair | string | |
| regional_director | string | |
| status | enum | `setup`, `active`, `scoring`, `finalized` |

### 1.2 School

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| contest_id | fk | |
| name | string | e.g. "Kamiak High School" |
| short_name | string | e.g. "KHS" |
| division | enum | `1` or `2`. Division 1 = larger schools (AA/AAA/AAAA), Division 2 = smaller. |
| coach_name | string | |
| coach_email | string | |
| coach_phone | string | |
| address | string | |
| city_zip | string | |

### 1.3 Student

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| school_id | fk | |
| name | string | First and last |
| actual_grade | enum | `9`, `10`, `11`, `12` |
| competing_grade | enum | `9`, `10`, `11`, `12`. Defaults to actual_grade. Must be ≥ actual_grade ("playing up"). |
| is_knowdown | boolean | Whether this student is one of the school's 3 Knowdown competitors |

**Constraints:**
- A school may have at most 3 students with `is_knowdown = true`.
- `competing_grade >= actual_grade` (playing up only, never down).

### 1.4 Team

Teams are formed per-contest-type. A student can be on different teams for different contest types. Teams are identified by a number within a school (Team 1, Team 2, etc.).

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| school_id | fk | |
| contest_type | enum | `project`, `team_problem`, `topical` |
| team_number | integer | 1-based, unique per school + contest_type |

### 1.5 TeamMember

| Field | Type | Notes |
|-------|------|-------|
| team_id | fk | |
| student_id | fk | |

**Constraints:**
- A student may be on at most one team per contest_type within their school.
- Team members must be from the same school.
- For `project` and `team_problem` teams: up to 3 members, must have different `competing_grade` values.
- For `topical` teams: up to 3 members, must have different `competing_grade` values.
- A student competing on a `topical` team may NOT also have individual topical scores (mutually exclusive).

### 1.6 Scores

#### 1.6.1 ProjectScore

One score per team.

| Field | Type | Notes |
|-------|------|-------|
| team_id | fk | team with contest_type = `project` |
| score | decimal | e.g. 50.5, 53.5. No fixed max — just a single combined score. |

#### 1.6.2 TeamProblemScore

One score per team.

| Field | Type | Notes |
|-------|------|-------|
| team_id | fk | team with contest_type = `team_problem` |
| score | decimal | e.g. 18, 23. Single score for the team. |

#### 1.6.3 TopicalTeamScore

Per topical team, two parts.

| Field | Type | Notes |
|-------|------|-------|
| team_id | fk | team with contest_type = `topical` |
| part1 | decimal | Part 1 score (0–75) |
| part2 | decimal | Part 2 score (0–75) |
| *total* | computed | part1 + part2 (max 150) |

#### 1.6.4 TopicalIndividualScore

Per student competing individually in topical (NOT on a topical team).

| Field | Type | Notes |
|-------|------|-------|
| student_id | fk | |
| part1 | decimal | Part 1 score (0–75) |
| part2 | decimal | Part 2 score (0–75) |
| *total* | computed | part1 + part2 (max 150) |

#### 1.6.5 KnowdownResult

Recorded on the contest, not per-school.

| Field | Type | Notes |
|-------|------|-------|
| contest_id | fk | |
| place | enum | `1`, `2`, `3`, `4` (4th = alternate) |
| student_id | fk | |

---

## 2. Computed Standings & Awards

### 2.1 Award Categories

Each event is ranked independently. All team/project awards are separated by Division (1 and 2). Multiple teams from the same school may all place.

#### Team Project

Ranked by project score. Awards: 1st, 2nd, 3rd per division.

#### Team Problem

Ranked by team problem score. Awards: 1st, 2nd, 3rd per division.

#### Topical — Team

Ranked by topical team total (Part 1 + Part 2). Awards: 1st, 2nd, 3rd per division.

#### Topical — Individual

Ranked by individual topical total (Part 1 + Part 2), across all students competing individually. Awards: 1st, 2nd, 3rd overall per division.

#### Distinguished Students

Per grade level (9th, 10th, 11th, 12th): the top-scoring individual (by individual topical total) who did NOT already place in the top 3 overall. One per grade per division. These are highlighted within the Topical Individual leaderboard.

#### Knowdown

1st, 2nd, 3rd place (plus 4th as alternate). Not divided by division — single bracket across all schools.

### 2.2 Tiebreaker Rules

Ties for top-3 placements are resolved manually: the coordinator adjusts scores so there are no ties in the positions that matter.

---

## 3. User Roles & Auth

| Role | Description |
|------|-------------|
| **Coordinator** | Contest administrator. Can create/manage the contest, add schools, enter ALL scores, view all data, finalize results. |
| **Coach** | Per-school. Can enter/edit their school's students, form teams, designate Knowdown competitors. Cannot enter scores. |

Authentication: email/password or magic link. Coordinators invite coaches via email and associate them with a school.

---

## 4. User Flows

### 4.1 Contest Setup (Coordinator)

1. Create contest (region, year, name, chair, director).
2. Add schools (name, division, coach info).
3. Invite coaches (sends email with login link).
4. Set contest status to `active` when registration is open.

### 4.2 Registration (Coach)

A coach logs in and sees their school's page.

1. **Add students:** Name, actual grade. Defaults competing_grade = actual_grade.
2. **Play up:** Optionally set a student's competing_grade higher than actual_grade.
3. **Form teams:** For each of the three contest types (project, team problem, topical), drag/assign students into numbered teams. UI enforces:
   - Max 3 per team.
   - All team members must have different competing_grade.
   - A student on a topical team cannot also have individual topical scores.
4. **Topical mode:** For each student NOT on a topical team, they are automatically marked as "individual topical."
5. **Knowdown:** Select exactly 3 students for Knowdown.
6. **Validation warnings:** Show real-time warnings if constraints are violated (same as the spreadsheet's red error flags).

### 4.3 Score Entry (Coordinator)

After the contest events run, the coordinator enters scores. Scores can be entered per-event:

#### Project Scores
- Select school → select team → enter single score.
- Or: table view of all teams across schools, enter scores in bulk.

#### Team Problem Scores
- Same pattern: per team, single score.

#### Topical Scores
- **Team topical:** Per team, enter Part 1 and Part 2. Total auto-calculated.
- **Individual topical:** Per student, enter Part 1 and Part 2. Total auto-calculated.
- UI should make clear which students are team vs individual.

#### Knowdown Results
- Enter 1st, 2nd, 3rd, 4th place (select student from all Knowdown-eligible students across schools).

### 4.4 Leaderboards (All Users)

Live-updating views, filterable by Division 1 / Division 2 / All:

1. **Project Rankings** — Teams ranked by project score.
2. **Team Problem Rankings** — Teams ranked by team problem score.
3. **Topical Team Rankings** — Teams ranked by topical total.
4. **Topical Individual Rankings** — Students ranked by individual topical total, with top 3 overall and per-grade distinguished highlights.
5. **Knowdown Results** — 1st through 4th.

Each leaderboard row shows: rank, student/team name, school, division, score.

### 4.5 Finalization (Coordinator)

1. Review all scores and standings.
2. Mark contest as `finalized` — locks all edits.
3. Export results (CSV or printable view for awards ceremony).

---

## 5. Validation Rules Summary

| Rule | Enforced When |
|------|---------------|
| Team max 3 members | Team formation |
| Team members must have different competing_grade | Team formation |
| competing_grade ≥ actual_grade | Student entry |
| Max 3 Knowdown per school | Knowdown designation |
| Student can't be on topical team AND have individual topical scores | Team formation / score entry |
| Student on a team must be from the same school | Team formation |

---

## 6. Tech Considerations

### 6.1 Stack

- **Framework:** SvelteKit 5 (Svelte 5 with runes)
- **Deployment:** Cloudflare Pages + Workers
- **Database:** Cloudflare D1 (SQLite at the edge)
- **ORM:** Drizzle ORM (type-safe, first-class D1 support)
- **Auth:** Simple cookie-based sessions with a `users` table. Coordinator creates coach accounts with a generated password/link. No OAuth.
- **Styling:** Plain CSS or lightweight utility framework (TBD based on preference)

### 6.2 Key UX Priorities

1. **Score entry speed** — The coordinator is entering scores during a live event. Bulk entry (table/grid views) and keyboard-friendly navigation are critical.
2. **Real-time leaderboards** — Standings update as scores are entered. No manual "recalculate" step.
3. **Error prevention** — Catch invalid team formations and score entry errors immediately, not after the fact.
4. **Mobile-friendly** — Coaches may register students from a phone.

---

## 7. Resolved Questions

- **No overall sweepstakes.** Each event (Project, Team Problem, Topical Team, Topical Individual, Knowdown) is ranked independently.
- **Tiebreakers:** Coordinator manually adjusts scores to break ties for top-3 positions.
- **Score maximums:** Topical contests are out of 75 per part. Team Problem and Project scores are variable (no fixed max).
- **Multiple teams per school:** Yes, a school's teams can sweep all top positions.
- **State qualification:** Top 3 per division qualify at regionals; a minimum score threshold is applied later by state admins.
- **Historical data:** Each contest is standalone; no multi-year/multi-region support needed.

---

## 8. Build Plan

### Milestone 1 — Skeleton + Schema

Scaffold SvelteKit project with Cloudflare Pages adapter, Drizzle, and D1 binding. Define all database tables (contests, schools, students, teams, team_members, scores, knowdown_results, users). Run migrations against local D1. Seed with one contest and 2-3 schools from the spreadsheet for manual testing.

**Done when:** `npm run dev` serves a page, schema exists in D1, seed data queryable.

### Milestone 2 — Contest & School Management (Coordinator)

Coordinator can create a contest and add/edit/delete schools (name, division, coach info). Simple server-side forms — no auth yet, just the pages and form actions.

**Done when:** Coordinator can CRUD schools for a contest, data persists in D1.

### Milestone 3 — Student Entry & Team Formation (Coach)

Per-school page: add/edit/remove students (name, grade, competing grade, knowdown flag). Assign students to teams for each contest type (project, team problem, topical). All validation rules enforced (max 3 per team, different competing grades, max 3 knowdown, topical team vs individual mutual exclusion).

**Done when:** A school's full roster and team assignments can be entered and saved, with validation errors shown.

### Milestone 4 — Score Entry (Coordinator)

Score entry pages per event type:
- Project: select team → enter score.
- Team Problem: select team → enter score.
- Topical Team: select team → enter Part 1 + Part 2.
- Topical Individual: select student → enter Part 1 + Part 2.
- Knowdown: select 1st–4th place students.

Bulk/table entry view for speed.

**Done when:** All score types can be entered and persisted. Scores show up when re-visiting the page.

### Milestone 5 — Leaderboards & Awards

Read-only leaderboard pages for each event, filtered by division. Rankings computed from stored scores. Distinguished student logic. Knowdown results display.

**Done when:** All 6 leaderboard views render correctly with the seed data + entered scores.

### Milestone 6 — Auth & Roles

Add users table, login page, session cookies. Coordinator role gates score entry and contest management. Coach role gates their own school's student/team pages. Unauthenticated users see leaderboards only.

**Done when:** Login works, role-based access enforced, coaches can only see/edit their school.

### Milestone 7 — Polish & Deploy

Contest finalization (lock edits). Export/print results. Deploy to Cloudflare Pages with production D1. Mobile responsiveness pass.

**Done when:** App is deployed and usable for a real contest.

---

## 9. Testing Strategy

Bare minimum — just enough to catch regressions as milestones build on each other.

### What to test

1. **Validation logic** (unit tests): Team formation rules (max 3, different grades, topical exclusivity), knowdown limit, play-up constraint. These are the most error-prone and critical for correctness. Pure functions, no DB needed.

2. **Score computation** (unit tests): Ranking/sorting logic for leaderboards, distinguished student selection. Pure functions taking score data and returning ranked results.

3. **API smoke tests** (integration): One test per major form action (create school, add student, assign team, enter score) to verify the happy path writes to D1 and reads back correctly. Run against local D1.

### What NOT to test

- UI rendering / component tests
- Auth flows
- CSS / layout
- Every edge case in form validation (the unit tests on validation logic cover the core rules)

### Tooling

- **Vitest** — already standard for SvelteKit projects
- Tests run with `npm test` before each milestone is considered done

---

## 10. Out of Scope (for v1)

- JV/Varsity distinction (per your request)
- Knowdown bracket/elimination tracking (just final placements)
- Public-facing results page (internal tool only for now)
- Payment/registration fees
- Multi-region aggregation
