# WSMC statewide implementation progress

This is the implementation tracker for [the execution plan](execution-plan.md).
The older root [PROGRESS.md](../PROGRESS.md) records the historical prototype
and is not used as the v2 status source.

## Current checkpoint

- **Active phase:** Phase 10 — Hardening and production rollout
- **Completed:** Initial execution-plan commit; baseline verification; v2
  architecture decisions; prototype D1 confirmed disposable; pure-domain
  Team Contest terminology and qualification rules/tests; v2 schema reset,
  representative seed, local integration checks, and repository scope/rule
  coverage; shared v2 score validation and versioned result persistence; the
  first authorized scoring surface with filters, missing indicators,
  per-result editor/version metadata, finalization completeness reporting,
  separate reopen/publish controls, and score-change/lifecycle audit events;
  versioned score CSV export, preview, stale-version validation, and atomic
  import with operation/audit records; server-backed regional result boards
  with division-separated competition ranking, Topical Individual overall and
  actual-grade ranks, and ordered Knowdown results; explainable regional
  placement qualification decisions with frozen draft/
  published rounds; division-specific state score-cutoff preview/draft
  services and audited manual include/exclude decisions; state attendance,
  roster, entry, publication, and report workflows; coach-scoped state
  dashboard data; and safe structured request diagnostics
- **Next:** Obtain explicit approval to reset the configured legacy remote D1,
  configure the missing production email values, deploy the v2 worker, and
  run the post-deploy smoke test. The remote target has not been modified.

## Phase 2 checkpoint

- **Implemented:** Web Crypto token hashing/randomness; single-use expiring
  links; resend invalidation; long-lived sessions; session/user revocation;
  development and Cloudflare-compatible email adapters; capability checks;
  SvelteKit principal loading; login, callback, and sign-out routes; direct
  unauthenticated POST rejection; legacy prototype route retirement; and a
  statewide-coordinator-only `/admin/users` invitation and access page with
  assignment selection, link/session revocation, disable/enable controls, and
  self-disable protection
- **Verified:** 83 unit tests, 0 type-check errors, the existing build gate,
  and D1-backed auth schema checks for replay, expiry, disabled users,
  overlapping assignments, and multi-school coaches
- **Status:** Phase 2 acceptance is met by the passwordless routes, persisted
  principal/assignment loading, explicit score/roster/finalization capability
  boundaries, and server endpoint authorization tests. Workflow-specific
  scorekeeper tests will land with the scoring routes.

## Phase 3 checkpoint

- **Implemented:** v2 program setup service and `/program` coordinator surface
  for season creation/status, numbered regions, contest creation, season-region
  ownership validation, contest dates, and monotonic lifecycle transitions.
- **Implemented:** `/schools` directory with normalized same-city duplicate
  suggestions, explicit duplicate confirmation, and reversible active/inactive
  status.
- **Implemented:** `/participation` contest invitation and response flow with
  division validation, lifecycle locking, and contest-scoped authorization;
  system-coordinator coach assignment/removal for active users and schools.
- **Implemented:** Setup-readiness summaries with missing regional-contest and
  outstanding-invitation counts; explicit state contest policy configuration;
  complete assignment removal across statewide, regional, coach, and
  scorekeeper assignments.
- **Status:** Phase 3 acceptance is met for coordinator-created season
  structure, regional school/coach invitations, existing-email assignment
  reuse, uncoached-school administration, and setup completeness.

## Phase 4 checkpoint

- **Implemented:** v2 registration service and mobile-first
  `/registration/[contestId]/[schoolId]` route for annual-student CRUD,
  explicit contest-roster selection, category entry creation, per-entry team
  competing grades, membership removal, readiness counts, and coordinator
  roster reopening with an audited reason.
- **Implemented:** Server-side lifecycle and contest/school scope checks for
  team size, playing-up, distinct grades, one-entry-per-category, Topical
  exclusivity, and Knowdown limits through the existing repository boundary;
  direct annual-student, roster, and entry POSTs all reject locked contests.
- **Verified:** 83 unit tests, 0 type-check errors, a clean production build,
  seeded D1 runtime login and registration workflow, 390px phone-width layout
  with no horizontal overflow, and accessible names for all visible form
  controls. The local Pages preview must use the configured D1 database ID
  when it is pointed at an explicitly migrated persistence directory.
- **Status:** Phase 4 acceptance is met. Coaches and regional coordinators can
  maintain annual students, explicitly select contest rosters, create and edit
  category entries, and reopen locked rosters through the audited workflow.

## Phase 5 checkpoint

- **Implemented:** Versioned `wsmc.registration.v1` CSV export with stable
  student and entry IDs, explicit roster/category/team-grade columns,
  spreadsheet formula-injection protection, row-level normalization and
  validation, preview-without-writes, D1 atomic batch import, idempotent
  membership reconciliation, lifecycle and permission gates, and audited
  imports. The registration page now exposes download, preview, and import
  controls, and the format is documented in [registration-csv.md](registration-csv.md).
- **Verified:** Fresh seeded D1 export, preview, successful import, repeated
  import, and rejected stale-ID import all ran through the worker; rejected
  input left counts unchanged.
- **Verified:** Fixture coverage includes blank-ID new students, duplicate
  names, invalid teams, stale IDs, formula injection, and locked-contest
  rejection; the seeded worker verified export, preview, import, repeated
  import, audit creation, and atomic rejection.
- **Status:** Phase 5 acceptance is met. A coach can download, edit, preview,
  and re-import a complete school registration without legacy workbook
  coupling.

## Phase 6 checkpoint

- **Implemented:** Shared v2 score validation distinguishes blank from zero,
  enforces category-specific score shapes and Topical part limits, derives
  topical totals, and stores optimistic-concurrency versions with the last
  editor. The new `/scoring/[contestId]` route is independently gated by
  contest score capability, supports category/division/missing filters,
  keyboard-friendly native inputs, and displays per-entry completeness and
  editor metadata.
- **Implemented:** Coordinator-only finalization requires a complete report;
  reopening requires a reason and clears publication; publication is a
  separate action. Score saves and lifecycle changes append audit events.
- **Verified:** 91 unit tests, 0 type-check errors, a clean production build,
  seeded-worker score CSV download/preview, finalized regional results, no
  horizontal overflow at 390px, and no unlabeled controls. Existing
  prototype warnings remain isolated to retired score/leaderboard pages.
- **Status:** Phase 6 acceptance is met for score validation, CSV round trip,
  stale-edit protection, completeness/finalization controls, and regional
  rankings. The next dependent package is Phase 7 qualification snapshots.

## Phase 7 checkpoint

- **Implemented:** Pure regional placement decisions consume finalized ranking
  boards and preserve all ties through rank 3. Topical Individuals retain
  separate overall and actual-grade reasons, while Knowdown records ranks 1–3
  as active and rank 4 as an inactive alternate.
- **Implemented:** Coordinator-only `/qualifications/[seasonId]` review and
  publication flow stores a season-scoped `regional_placements` draft,
  deduplicates repeated qualification/reason generation, and freezes a
  published round. Generation and publication are audited.
- **Implemented:** Pure cutoff previews apply division-specific thresholds only
  to Team Contest, Topical Team, and Topical Individual; placement-qualified
  entries are reported as already qualified. Draft cutoff persistence and
  reasoned manual include/exclude services use separate frozen round types and
  preserve audit records.
- **Verified:** 95 unit tests, 0 type-check errors, a clean production build,
  and the seeded worker review page showing the published round and its
  explainable reasons plus a no-write cutoff preview.
- **Verified:** Cutoff drafts, manual include/exclude decisions, frozen-round
  publication guards, and post-publication score-correction impact audits are
  covered by the qualification and scoring services and exposed on the review
  page.
- **Status:** Phase 7 acceptance is met. The next dependent package is Phase 8
  state attendance and entry administration.

## Phase 8 checkpoint — initial state workflow

- **Implemented:** State-contest dashboard and mobile-first
  `/state/[contestId]` administration for qualified-school attendance, explicit
  state roster admission basis, qualified team-berth entry creation, state
  category entry creation, substitutions, and entry membership management.
- **Implemented:** State mutations independently enforce the state contest,
  registration-open lifecycle, season and school scope, published qualification
  source, team-berth source, explicit mixed-entry division, state policy flags,
  state-roster membership, per-entry grade rules, and one-entry-per-category
  restrictions. Multi-record changes use D1 batches and append audit events.
- **Verified:** 101 unit tests, 0 type-check errors, a clean production build,
  seeded-worker state administration at 390px with no horizontal overflow,
  successful attendance update, and rejected invalid roster admission without a
  write. The full check/build gate now reports zero warnings.
- **Status:** Phase 8 acceptance is met for attendance, explicit admission
  sources, substitutions, mixed-entry policy enforcement, and state locking.

## Phase 9 checkpoint — initial state publication slice

- **Implemented:** State contests reuse shared scoring, finalization, and
  optimistic-concurrency behavior. State rankings use the same category-aware
  competition ranking functions, including mixed-school display names.
- **Implemented:** A public `/state/[contestId]/results` route is available only
  after state results publication and returns result fields without internal
  entry, roster, qualification, or user identifiers.
- **Implemented:** Authenticated, permission-scoped state-roster CSV export with
  stable IDs, explicit admission basis, source links, and formula-injection
  protection.
- **Implemented:** Authenticated report exports for school directory,
  contest participation, finalized results, and published qualification
  reasons, all using formula-safe stable CSV serialization.
- **Implemented:** Authenticated season reporting hub for assigned coaches and
  coordinators, linking finalized regional boards, published state results,
  and frozen qualification rounds.
- **Verified:** All five report downloads from the seeded worker, including the
  finalized regional results report and the anonymous published-state-results
  path, plus the test/check/build gates. The public success path used a
  temporary disposable finalized-state fixture. A temporary state scoring
  fixture also completed scoring → finalized → published, with no
  qualification-impact audit generated for state scoring.
  The season reporting hub was verified at 390px with no horizontal overflow.

## Phase 10 checkpoint — hardening slice

- **Implemented:** Coach state-dashboard responses are scoped to assigned
  school-owned records; coordinator-owned mixed-school entries, unassigned
  qualification sources, team-berth administration, and other schools’ roster
  data are excluded from coach payloads.
- **Implemented:** Safe structured server-error diagnostics include a request
  identifier, HTTP status, and a redacted pathname without query strings,
  callback token values, roster contents, or raw exception messages.
- **Implemented:** A CI journey contract covers regional ranking and
  qualification handoff, cutoff eligibility, mixed state ranking, overlapping
  assignments, and scorekeeper/finalization boundaries.
- **Implemented:** Existing score records require an expected optimistic-
  concurrency version at the persistence boundary, preventing unversioned
  direct POST overwrites.
- **Implemented:** Anonymous state results use a dedicated explicit-field
  projection with regression coverage for internal entry and student IDs.
- **Implemented:** The versioned score-CSV export now supports both regional
  and state contests, with regression coverage for state scoring exports.
- **Implemented:** State score-CSV imports no longer create regional
  qualification-impact reviews; that audit remains limited to regional score
  changes.
- **Implemented:** README and D1 operations documentation now describe the v2
  statewide application and local/remote recovery workflow.
- **Implemented:** The D1 integration check now restores a seeded database into
  a fresh SQLite copy and verifies the core record counts before exercising the
  mutation invariants.
- **Implemented:** Global keyboard accessibility includes a skip link, an
  explicitly labeled primary navigation landmark, and visible focus indicators
  for interactive controls.
- **Implemented:** Production email configuration now fails closed unless the
  Resend credentials are present, preventing accidental raw sign-in-link logs;
  the operations runbook documents the required environment values.
- **Implemented:** A repeatable Pages HTTP smoke script checks login,
  private-route protection, unauthenticated POST rejection, and the exact
  public-results boundary against a supplied local or deployed URL, with
  configurable state contest ID and publication status.
- **Implemented:** Contest lifecycle mutations now require the contest’s
  stored season scope, and regional coach-assignment mutations are limited to
  schools participating in contests that coordinator actually manages.
- **Implemented:** The disposable `npm run rehearsal` command scales a local
  fixture to 24 schools and 240 annual students, verifies the regional-to-state
  handoff, provisions two scorekeepers, tests stale-version rejection, and
  exercises coordinator recovery.
- **Implemented:** The primary-flow accessibility review is recorded in
  [accessibility-review.md](operations/accessibility-review.md), including
  mobile overflow, accessible names, landmarks, feedback semantics, focus
  contrast, empty states, and the published public leaderboard.
- **Implemented:** The non-developer coordinator workflow is documented in
  [coordinator-workflow.md](operations/coordinator-workflow.md), covering
  season setup, invitations, registration, scoring, qualification review,
  state administration, reports, and recovery checks.
- **Implemented:** Direct route authorization tests now cover unauthenticated
  loads and every scoring, state-administration, qualification, and report
  endpoint before database access.
- **Implemented:** Production sign-in links now require a configured HTTPS
  `APP_ORIGIN`; login, administrator invitations, and coach invitations no
  longer fall back to an untrusted request host.
- **Implemented:** An isolated authenticated Pages-preview journey now seeds
  disposable D1 state, provisions fixture sessions, traverses the regional-
  to-state workflow over HTTP, exercises a real attendance mutation, checks
  scorekeeper scope, and verifies stale score rejection. Cloudflare action
  errors preserve their intended HTTP status with SvelteKit `isHttpError`.
- **Implemented:** The repository CI workflow runs unit, type-check, build,
  D1 restore, dress-rehearsal, and authenticated Pages-preview gates on pushes
  and pull requests.
- **Verified:** Read-only Cloudflare inspection identified the configured
  `wsmc.pages.dev` project, confirmed the remote D1 is still the legacy
  prototype schema with the v2 baseline unapplied, and found no production
  Pages secrets. Production deployment remains intentionally pending those
  operator-controlled preconditions.
- **Verified:** 124 unit tests now include access-scope, exact public-route,
  safe-diagnostic, and journey coverage. `npm test`, `npm run check`,
  `npm run build`, `npm run test:db`, `npm run rehearsal`, and
  `npm run test:e2e:preview` all pass.
- **Verified:** Live preview smoke check at 390px found no horizontal overflow
  and no unlabeled visible controls on the program setup page.
- **Verified:** Live preview review at 390px across program, registration,
  scoring, qualifications, state administration, and statewide reports found
  no horizontal overflow and no unlabeled visible controls.
- **Verified:** The HTTP smoke suite passed against the live local Pages
  preview: login 200, private GET redirect 303, private POST rejection 401,
  unpublished state results 404, and a non-results state path redirect 303.
- **Verified:** The mobile review caught and fixed intrinsic-width overflow on
  the qualification form; the final six-page pass measured document widths of
  375–386px against a 390px viewport, with zero unlabeled visible controls.
- **Verified:** The final eight-page mobile pass measured no horizontal
  overflow and zero unnamed visible controls on authentication, program,
  registration, scoring, qualifications, state administration, reports, and
  published state results.
- **Verified:** `npm run rehearsal` passed at the documented scale, and the
  restored local Pages smoke suite passed login 200, private GET redirect 303,
  private POST rejection 401, unpublished state results 404, and the exact
  public-results route boundary.

## Phase checklist

- [x] Phase 0 — Baseline and v2 contract
- [x] Phase 1 — V2 schema and persistence foundation
- [x] Phase 2 — Passwordless authentication and authorization
- [x] Phase 3 — Season, directory, contests, and user administration
- [x] Phase 4 — Mobile regional roster and entries
- [x] Phase 5 — CSV roster and entry round trip
- [x] Phase 6 — Scoring, score CSV, and regional results
- [x] Phase 7 — Qualifications and statewide cutoff rounds
- [x] Phase 8 — State attendance, substitutions, and entries
- [x] Phase 9 — State scoring, visibility, and exports
- [ ] Phase 10 — Hardening and production rollout

## Verification gates

Each phase must leave `npm test`, `npm run check`, and `npm run build` passing.
Phase-specific acceptance criteria remain in the execution plan and are not
considered complete based on this checklist alone.
