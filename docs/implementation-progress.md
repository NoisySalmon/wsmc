# WSMC statewide implementation progress

This is the implementation tracker for [the execution plan](execution-plan.md).
The older root [PROGRESS.md](../PROGRESS.md) records the historical prototype
and is not used as the v2 status source.

## Current checkpoint

- **Active phase:** Phase 1 — V2 schema and persistence foundation
- **Completed:** Initial execution-plan commit; baseline verification; v2
  architecture decisions; prototype D1 confirmed disposable; pure-domain
  Team Contest terminology and qualification rules/tests; v2 schema reset,
  representative seed, and local integration checks
- **Next:** Complete repository integration coverage for cross-scope mutation
  rejection and then begin Phase 2 authentication/authorization

## Phase checklist

- [x] Phase 0 — Baseline and v2 contract
- [ ] Phase 1 — V2 schema and persistence foundation (implementation in progress; repository integration coverage pending)
- [ ] Phase 2 — Passwordless authentication and authorization
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
