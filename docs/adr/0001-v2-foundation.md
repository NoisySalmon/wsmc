# ADR 0001: V2 statewide foundation

**Status:** Accepted for implementation
**Date:** 2026-09-06

## Context

The current application is a single-regional-contest prototype. Its database
contains only prototype/seed data, and its contest-owned schools, student-level
competing grade, and single-role users do not support the statewide workflow in
the product requirements.

## Decisions

1. **Reset rather than migrate the prototype database.** The existing local D1
   data is disposable, so Phase 1 will create a clean v2 schema and seed. No
   production contest records are being preserved.
2. **Use assignment-based authorization.** Users may hold multiple statewide,
   regional, school-coach, and contest-scorekeeper assignments. Capabilities are
   derived from those scoped assignments rather than a single role or school ID.
3. **Persist annual students.** A student record belongs to one school and
   season; students do not roll forward between seasons and never receive user
   accounts.
4. **Store competing grade on entry membership.** Actual grade belongs to the
   annual student. A team membership stores the competing grade for that specific
   entry, allowing the same student to play up differently across categories.
5. **Store qualification decisions and reasons.** State eligibility is frozen as
   explicit qualification records with all placement, cutoff, alternate, and
   manual reasons. It is not a live query that can silently change.
6. **Use versioned human-editable CSV only for interoperability.** CSV templates
   are the supported import/export contract. The system will not preserve or
   couple itself to the prototype workbook format.

## Consequences

- Phase 1 may replace the current migration and seed without a data-export phase.
- Authorization, roster, and qualification work can be tested against explicit
  parent scopes and immutable decisions.
- Historical prototype routes remain temporarily compatible at their boundary,
  but new domain code uses `team_contest` and “Team Contest”.
- The schema must preserve source and final state-team membership for substitutions
  and must use append-only migrations after the v2 baseline.

## References

- [Product requirements](../product-requirements.md)
- [Execution plan](../execution-plan.md)
