# WSMC Contest Administration — Execution Plan

**Status:** Ready for implementation planning  
**Requirements:** `docs/product-requirements.md`  
**Target stack:** SvelteKit 5, TypeScript, Drizzle ORM, Cloudflare D1/Pages

## 1. Strategy

The existing application is a working regional-scoring prototype, not a safe base for incremental authentication and state qualification. Its schema makes schools contest-owned, students school/contest-owned, and users single-role. Replace those foundations first.

Preserve and adapt:

- SvelteKit/Cloudflare project configuration.
- The pure-function approach in `src/lib/validation.ts` and `src/lib/rankings.ts`.
- Useful visual patterns from roster, score-entry, and leaderboard pages.
- The existing unit-test toolchain.

Do not preserve as architectural constraints:

- Current database tables or the single migration.
- Contest-owned school records.
- Student-level `competingGrade`.
- Separate hard-coded page actions without shared authorization/domain services.
- The `users.role` and `users.schoolId` authorization model.
- “Team Problem” terminology.

### Working migration assumption

The current database contains prototype/seed data only and can be reset. Implement a clean v2 schema and seed rather than a production data migration. Before Phase 1 begins, confirm no real contest data needs preservation. If it does, insert a dedicated migration/export phase before changing the schema.

## 2. Engineering conventions

Every implementation task must follow these rules:

- Put business rules in typed server/domain modules, not only Svelte components or form actions.
- Gate every server load, action, endpoint, and import independently; hidden UI is not authorization.
- Scope every mutation through its parent contest/school/entry rather than trusting submitted IDs.
- Repeat all client validation on the server.
- Use database transactions or D1 batch operations for multi-record changes.
- Treat blank scores differently from zero.
- Add or update tests in the same work package as behavior.
- Do not mark a phase complete with failing `npm test`, `npm run check`, or `npm run build`.
- Keep schema migrations append-only after the v2 baseline lands.
- Use “Team Contest” in UI, types, tests, and data.

## 3. Target architecture

Use four layers:

1. **Routes/components** — request parsing and presentation.
2. **Application services** — workflows, authorization checks, transactions, and audit calls.
3. **Domain modules** — pure validation, ranking, qualification, and lifecycle rules.
4. **Persistence repositories** — contest-scoped Drizzle queries.

Avoid introducing a separate API service or client state framework. SvelteKit server loads/actions and focused JSON endpoints are sufficient.

### 3.1 Conceptual data groups

The exact DDL belongs to Phase 1 design, but it must represent these groups without polymorphic ambiguity that bypasses foreign keys:

- **Identity:** users, one-time sign-in tokens, sessions.
- **Authorization:** statewide assignments, contest staff assignments, school coach assignments.
- **Program:** seasons, regions, contests, contest lifecycle/publication.
- **Organizations:** schools and contest school participations/invitations.
- **People:** annual students and per-contest roster membership.
- **Competition:** entries, entry members with per-entry competing grade, and results.
- **Qualification:** qualification subjects/reasons, cutoff rounds, manual decisions, and alternate status.
- **State:** school attendance, exercised team berths, and admission basis for each state-rostered student.
- **Operations:** imports and append-only audit events.

Prefer one `entries` abstraction shared by team and individual categories, with database checks and domain validation. A result can use a category-aware record with one combined score or two topical parts; Knowdown placement should remain an ordered contest result. Do not create a generic dynamic-field rules engine.

## 4. Delivery phases

Phases are ordered. An agent should complete and verify one work package before the next dependent package starts. Tasks within a phase may be split only when their file ownership and migration order do not overlap.

### Phase 0 — Baseline and v2 contract

**Goal:** Establish a safe starting point and turn the requirements into executable domain tests.

Tasks:

1. Confirm whether current D1 data is disposable; document the answer.
2. Add a concise architecture decision record for the v2 reset, assignment-based authorization, annual students, per-entry competing grade, stored qualifications, and CSV-only interoperability.
3. Rename domain terminology from Team Problem to Team Contest in pure modules/tests first; routes may remain temporarily until replaced.
4. Expand pure unit tests to encode:
   - Per-entry playing-up and distinct-grade rules.
   - Explicit Topical Team/Individual exclusivity.
   - Competition ranking with ties at qualification boundaries.
   - Overall and actual-grade Topical Individual placement.
   - Deduplication of multiple qualification reasons.
   - Placement plus cutoff qualification union.
5. Record current `npm test`, `npm run check`, and `npm run build` output.

Acceptance criteria:

- Product requirements and decisions are linked from the repository README.
- New domain tests describe agreed behavior and pass independently of D1.
- No v2 feature relies on the old single-role or contest-owned school model.

### Phase 1 — V2 schema and persistence foundation

**Goal:** Replace the prototype schema with a normalized annual/statewide foundation.

Tasks:

1. Design the concrete DDL from Section 3.1 and document relationship/cardinality decisions.
2. Create a fresh v2 migration and representative seed data containing:
   - One season, at least two regions, their regional contests, and one state contest.
   - Schools in both divisions.
   - A user with coordinator and coach assignments.
   - Multiple coaches for one school and one contest scorekeeper.
   - Regional students and entries in every category.
   - At least one cross-school state Team Contest entry.
3. Add timestamps, unique constraints, foreign keys, lifecycle constraints, and indexes for contest/school/category queries.
4. Add repository helpers that require parent scope in mutation methods.
5. Add integration tests for cross-contest ID rejection, unique membership, Topical exclusivity, team size/grade validation, and cascade/archive behavior.

Acceptance criteria:

- A clean local D1 can migrate and seed from scratch.
- The seed demonstrates every important relationship.
- Invalid cross-contest mutations fail at the service/repository boundary.
- Schema and repository integration tests pass.

### Phase 2 — Passwordless authentication and authorization

**Goal:** Make every non-public workflow securely attributable to a user.

Tasks:

1. Implement an email-provider interface with a safe development adapter and one production Cloudflare-compatible provider.
2. Implement invite issuance, hashed single-use tokens, expiry, resend/revoke, login callback, long-lived sessions, sign-out, and administrator session revocation.
3. Load the authenticated principal and assignments into SvelteKit `locals`.
4. Add reusable capability checks for statewide coordination, regional coordination, school coaching, and contest scorekeeping.
5. Protect all existing and new server loads/actions. Temporarily disable legacy mutations that cannot be safely scoped to v2 data.
6. Add a documented bootstrap path for the first statewide coordinator.
7. Test token replay, expiry, disabled users, assignment overlap, multi-school coaches, and direct unauthorized POST requests.

Acceptance criteria:

- A user can sign in from a mobile email link and remain signed in.
- One user can act as regional coordinator and school coach.
- Scorekeepers can change scores but cannot edit rosters or finalize.
- Authorization tests target server endpoints, not only visible controls.

### Phase 3 — Season, directory, contests, and user administration

**Goal:** Let statewide and regional coordinators set up an annual program.

Tasks:

1. Build season creation and archive/read-only views.
2. Build numbered-region management and enforce one regional contest per region/season plus one state contest/season.
3. Build contest dates, lifecycle display, and state policy settings.
4. Build the lightweight school directory with duplicate suggestions and active/inactive state.
5. Build school participation/invitation, division assignment, response status, and coach assignment flows.
6. Build user administration for pending, active, and disabled users plus assignment management.
7. Add coordinator dashboards showing setup completeness and outstanding invitations.

Acceptance criteria:

- A statewide coordinator can create the full season structure without direct database access.
- A regional coordinator can invite a new or existing school and multiple coaches.
- An existing email gains an assignment without a duplicate account.
- An uncoached school remains fully administrable by its regional coordinator.

### Phase 4 — Mobile regional roster and entries

**Goal:** Replace the prototype school page with a mobile-first, explicit registration workflow.

Tasks:

1. Build annual-student CRUD with actual grade.
2. Build contest roster selection separately from the annual student list.
3. Build explicit individual and team entry management by category.
4. Store competing grade on team membership and allow it to vary by category.
5. Enforce team size, same-school regional membership, playing-up, distinct grades, one-entry-per-category, Topical exclusivity, and Knowdown maximum.
6. Add readiness summaries and actionable validation messages.
7. Implement Registration open and Roster locked mutation gates, including coordinator reopen with reason.
8. Test representative phone-width layouts and keyboard/screen-reader behavior.

Acceptance criteria:

- A coach can complete registration on a phone without horizontal page scrolling.
- No student is automatically entered in a category.
- The same student can use different competing grades and teammates in three team categories.
- Locked rosters reject direct POST edits until explicitly reopened.

### Phase 5 — CSV roster and entry round trip

**Goal:** Support spreadsheet-friendly adoption without legacy workbook coupling.

Tasks:

1. Specify and version a human-editable roster/entry CSV template.
2. Export a school template with stable IDs for existing records and clear columns for actual grade, each category, team labels, competing grades, and Knowdown selection.
3. Implement upload parsing, normalization, preview, row-level validation, and all-or-nothing commit.
4. Make repeated import idempotent and lifecycle/permission aware.
5. Prevent CSV formula injection on export.
6. Add fixture-based tests for new roster import, exported-file round trip, duplicate names, invalid teams, stale IDs, locked contests, and repeated upload.

Acceptance criteria:

- A coach can export, edit, preview, and re-import a complete school registration.
- Preview performs no writes.
- An erroneous file cannot partially alter the roster.
- Export-import-export preserves the same logical entries.

### Phase 6 — Scoring, score CSV, and regional results

**Goal:** Deliver a reliable contest-day scoring workflow.

Tasks:

1. Build shared score-entry services and category-specific validation.
2. Build fast tables with keyboard navigation, filters, missing-score indicators, and per-row last-editor information.
3. Support coordinator and multiple scorekeeper concurrency without silent lost updates.
4. Build versioned, prefilled score CSV exports and previewed, atomic imports.
5. Build a finalization completeness report.
6. Implement regional rankings using server-tested domain functions.
7. Implement lifecycle transitions through Scoring and Finalized, coordinator reopen with reason, and separate result publication.
8. Audit score changes/imports, lifecycle changes, and publication.

Acceptance criteria:

- Blank and zero scores survive UI and CSV round trips distinctly.
- Topical part limits are enforced server-side.
- Scorekeepers cannot change out-of-scope contest entries.
- Tied rankings use competition rank correctly.
- Finalization reports missing results and locks accepted results.

### Phase 7 — Qualifications and statewide cutoff rounds

**Goal:** Convert regional results into explainable, frozen state eligibility.

Tasks:

1. Generate automatic placement qualification reasons after each regional finalization.
2. Compute Topical Individual overall and actual-grade placements per division without excluding students who qualify through both.
3. Record first through third Knowdown and inactive fourth-place alternate.
4. Build an automatic-qualifier review and publication page.
5. Build statewide, per-division threshold preview for Team Contest, Topical Team, and Topical Individual.
6. Show entry, student, team, school, and total-population effects while thresholds change.
7. Support reasoned manual include/exclude decisions.
8. Publish immutable cutoff rounds and warn/review when later score corrections would change them.
9. Implement explicit Knowdown alternate promotion.

Acceptance criteria:

- All ties at ranks 1–3 qualify.
- One student can show several qualification reasons without duplicate state eligibility.
- Placement qualifiers remain when below the score threshold.
- Thresholds combine all finalized regions and remain division-specific.
- Published qualification sets do not silently change.

### Phase 8 — State attendance, substitutions, and entries

**Goal:** Turn qualifications into the actual state roster and category entries.

Tasks:

1. Build qualified-school attendance intent and progress dashboard.
2. Let coaches create the state roster from individual qualifications and exercised team berths.
3. Permit same-school replacement/new students on qualified team berths, including students absent from the regional roster.
4. Do not require an original regional member; preserve source and final memberships for comparison.
5. Validate an admission basis for every state-rostered student.
6. Build explicit state category entry management.
7. Implement the Topical Individual eligibility and cross-school Topical Team setup policies.
8. Build state-coordinator management for cross-school Team Contest teams and optional cross-school Topical Teams.
9. Require explicit coordinator-confirmed division for mixed-school entries.
10. Reuse contest lifecycle and locking behavior for state.

Acceptance criteria:

- A two-person qualifying team can become a three-person state team.
- All original team members can be replaced without breaking history.
- An individual qualification cannot be transferred.
- Mixed teams cannot use students outside the confirmed state roster.
- Each student appears at most once per state category.

### Phase 9 — State scoring, visibility, and exports

**Goal:** Complete state contest operation and publish useful results.

Tasks:

1. Reuse the shared scoring/ranking system for state.
2. Build authenticated statewide regional-results and qualification-report pages for all coaches.
3. Build a public, publication-gated state leaderboard exposing only intended result fields.
4. Add CSV exports for school directory, contest participation, results, qualification reasons, and state roster.
5. Verify division filtering and mixed-team display.
6. Add accessible empty, draft, finalized, and unpublished states.

Acceptance criteria:

- Unauthenticated users cannot see rosters/contact data but can see published state results.
- Coaches can see published results across every region.
- Every required administrative report downloads as safe CSV.
- State finalization does not create further qualifications.

### Phase 10 — Hardening and production rollout

**Goal:** Make the system safe and operable for a live season.

Tasks:

1. Add end-to-end tests for one complete regional-to-state journey, including overlapping assignments and scorekeeper access.
2. Add security tests for IDOR/cross-scope mutations, token replay, CSV injection, and public data leakage.
3. Complete WCAG 2.2 AA review for authentication, coach registration, scoring, qualifications, and public leaderboard.
4. Add structured error logging and operational diagnostics without logging sign-in tokens or unnecessary student data.
5. Document D1 backup/export, migration, restore, coordinator bootstrap, email-provider setup, and incident recovery.
6. Exercise a dress rehearsal with realistic school/student counts and at least two simultaneous scorekeepers.
7. Deploy production infrastructure and run a post-deploy smoke test.

Acceptance criteria:

- Critical end-to-end and authorization tests pass in CI.
- Backup/restore and administrator recovery have been rehearsed.
- A non-developer coordinator can complete the documented season setup and contest-day workflow.
- `npm test`, `npm run check`, and `npm run build` pass without ignored errors.

## 5. Suggested agent work-package format

When assigning a phase or subtask to an implementation agent, include:

1. The exact requirement sections and phase task numbers.
2. The tables/routes/modules the agent owns.
3. Explicit non-goals and files it must not refactor.
4. Required tests and commands.
5. A request to report assumptions before encoding an unstated contest rule.
6. A completion report listing migrations, behavior, tests, and remaining risks.

Example assignment:

> Implement Phase 4 tasks 3–5 from `docs/execution-plan.md` against the v2 schema. Own the entry domain service, its repository methods, the school entry route/components, and corresponding tests. Do not change authentication, qualification, scoring, or CSV modules. Enforce the rules in Product Requirements Sections 4 and 8 on the server and provide matching client feedback. Run `npm test`, `npm run check`, and `npm run build`. Report any requirement ambiguity rather than inventing a new rule.

## 6. Verification matrix

| Risk | Minimum verification |
|---|---|
| Authorization | Direct server-action/API tests for every assignment and cross-scope denial |
| Team validity | Pure unit tests plus integration tests against stored memberships |
| Lifecycle locks | Direct mutation attempts in every locked/finalized state |
| Rankings/ties | Fixture tests around rank 3, multi-way ties, divisions, and actual grades |
| Qualifications | Snapshot tests for placement/cutoff/manual union and post-publication score correction |
| CSV | Round-trip, idempotency, atomic rejection, stale IDs, and formula-injection fixtures |
| Concurrent scoring | Two stale editors or simultaneous row updates with no silent overwrite |
| Public privacy | Route tests proving only published state result fields are anonymous |
| Mobile/accessibility | Phone-width manual/E2E checks plus automated accessibility checks on primary flows |

## 7. Release slicing

If delivery must be staged, use these usable checkpoints:

- **Regional pilot:** Phases 0–6. Secure invitation, mobile registration, CSV, scoring, and regional results.
- **Qualification release:** Phase 7. State eligibility can be calculated and published.
- **State contest release:** Phases 8–9. Attendance, substitutions, ad-hoc teams, state scoring, and public results.
- **Production readiness:** Phase 10.

Do not launch the regional pilot on the current unauthenticated schema, and do not calculate real qualifications until qualification snapshot and audit behavior is implemented.
