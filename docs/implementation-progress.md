# WSMC statewide implementation progress

This is the implementation tracker for [the execution plan](execution-plan.md).
The older root [PROGRESS.md](../PROGRESS.md) records the historical prototype
and is not used as the v2 status source.

## Current checkpoint

- **Active phase:** Phase 3 — Season, directory, contests, and user administration
- **Completed:** Initial execution-plan commit; baseline verification; v2
  architecture decisions; prototype D1 confirmed disposable; pure-domain
  Team Contest terminology and qualification rules/tests; v2 schema reset,
  representative seed, local integration checks, and repository scope/rule
  coverage
- **Next:** Add contest participation/invitation, coach assignment, and
  coordinator setup-completeness views on top of the program setup surface.

## Phase 2 checkpoint

- **Implemented:** Web Crypto token hashing/randomness; single-use expiring
  links; resend invalidation; long-lived sessions; session/user revocation;
  development and Cloudflare-compatible email adapters; capability checks;
  SvelteKit principal loading; login, callback, and sign-out routes; direct
  unauthenticated POST rejection; legacy prototype route retirement; and a
  statewide-coordinator-only `/admin/users` invitation and access page with
  assignment selection, link/session revocation, disable/enable controls, and
  self-disable protection
- **Verified:** 64 unit tests, 0 type-check errors, the existing build gate,
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
- **Remaining:** Participation/invitation, coach assignment flows, and
  setup-completeness dashboards.

## Phase checklist

- [x] Phase 0 — Baseline and v2 contract
- [x] Phase 1 — V2 schema and persistence foundation
- [x] Phase 2 — Passwordless authentication and authorization
- [ ] Phase 3 — Season, directory, contests, and user administration
- [ ] Phase 4 — Mobile regional roster and entries
- [ ] Phase 5 — CSV roster and entry round trip
- [ ] Phase 6 — Scoring, score CSV, and regional results
- [ ] Phase 7 — Qualifications and statewide cutoff rounds
- [ ] Phase 8 — State attendance, substitutions, and entries
- [ ] Phase 9 — State scoring, visibility, and exports
- [ ] Phase 10 — Hardening and production rollout

## Verification gates

Each phase must leave `npm test`, `npm run check`, and `npm run build` passing.
Phase-specific acceptance criteria remain in the execution plan and are not
considered complete based on this checklist alone.
