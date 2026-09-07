# WSMC statewide implementation progress

This is the implementation tracker for [the execution plan](execution-plan.md).
The older root [PROGRESS.md](../PROGRESS.md) records the historical prototype
and is not used as the v2 status source.

## Current checkpoint

- **Active phase:** Phase 6 — Scoring, score CSV, and regional results
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
  published rounds
- **Next:** Complete Phase 7 cutoff previews, manual decisions, and
  qualification publication workflow.

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
- **Verified:** 89 unit tests, 0 type-check errors, a clean production build,
  and the seeded worker at 390px with no horizontal overflow and accessible
  names for all scoring controls. Existing prototype warnings remain
  isolated to retired score/leaderboard pages.
- **Verified:** 89 unit tests, 0 type-check errors, a clean production build,
  seeded-worker score CSV download, and preview of the exported file with no
  writes. The browser path remains within 390px at phone width.
- **Verified:** 91 unit tests, 0 type-check errors, a clean production build,
  and the seeded worker rendering finalized regional results with no
  horizontal overflow at 390px and no unlabeled controls.
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
- **Verified:** 93 unit tests, 0 type-check errors, a clean production build,
  and the seeded worker review page showing the published round and its
  explainable reasons.
- **Next:** Add statewide division-specific score-cutoff previews and
  reasoned manual include/exclude decisions without mutating frozen rounds.

## Phase checklist

- [x] Phase 0 — Baseline and v2 contract
- [x] Phase 1 — V2 schema and persistence foundation
- [x] Phase 2 — Passwordless authentication and authorization
- [x] Phase 3 — Season, directory, contests, and user administration
- [x] Phase 4 — Mobile regional roster and entries
- [x] Phase 5 — CSV roster and entry round trip
- [ ] Phase 6 — Scoring, score CSV, and regional results
- [ ] Phase 7 — Qualifications and statewide cutoff rounds
- [ ] Phase 8 — State attendance, substitutions, and entries
- [ ] Phase 9 — State scoring, visibility, and exports
- [ ] Phase 10 — Hardening and production rollout

## Verification gates

Each phase must leave `npm test`, `npm run check`, and `npm run build` passing.
Phase-specific acceptance criteria remain in the execution plan and are not
considered complete based on this checklist alone.
