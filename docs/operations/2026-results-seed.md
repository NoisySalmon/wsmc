# Historical 2026 results seed

This is a **private local dataset**, not a public fixture. The original workbooks
in `legacy/` and the extracted files in `scripts/data/2026-regionals/`
are gitignored because they contain real student and contact information. Keep them local. The replay seed and its two
optional integration checks (`test:2026-results` and `test:qualifications`)
require those private inputs; they are unavailable in a fresh public checkout.
Use the synthetic showcase fixtures for public development and CI.

```sh
npm run seed:2026-results
npm run dev
```

This replaces the persistent **local** database, just like `seed:showcase`.
It cannot select a remote target. For disposable local data instead, use
`npm run demo:preview -- 2026-results`.

The data comes from `scripts/data/2026-regionals/region-*.json`, extracted from
the administrators' workbooks. XLSX files and Python spreadsheet libraries are
not needed to generate the seed. The original extraction remains unchanged.
`node scripts/generate-2026-results.mjs OUTPUT.sql REPORT.json` generates SQL
and a report without connecting to a database.

## Starting state

- Season 2026 is in `qualifications`.
- All 11 regional contests are `finalized`, with publication pending.
- The state contest is in `setup`, with no invented contest date.
- One editable cutoff draft stores Project 0 / 0, Team Contest 14 / 10,
  Topical Team 89 / 68, and Topical Individual 50 / 50. No qualification
  decisions, attendance, or state rosters exist yet. Saving the qualification
  draft builds the combined placement/cutoff list; freezing locks it and
  publication advances the season to the state contest.
- All 53 named school sheets and 517 base student records are loaded. Resolved
  play-up records share the original annual student identity; team-problem and
  topical memberships remain independent.

Sign in using the state-admin development shortcut `/auth/demo/state`, or
`coordinator@wsmc.example` through `/login`. Regional accounts are
`regional1@wsmc.example` through `regional11@wsmc.example`. Coaches use
`coach-rREGION-SHEET@wsmc.example` (lowercase, for example
`coach-r2-s1@wsmc.example` for Hanford; spaces in sheet names become hyphens).
The showcase's Hanford coach shortcut
does not apply to this dataset. Local sign-in links appear in the terminal.
Workbook contact emails are school metadata, not login identities. Source
coach/director names are used for display, with fixture login emails.

## Unresolved source data

`scripts/data/2026-regionals/seed-report.json` is regenerated on each seed and
contains original extraction issues, omitted records, adjustments, and
incomplete imported fields, with entry IDs and source cell references. The same
details and original phone/fax/contact values are retained in each contest's
`historical_results_seeded` audit event. Phone/fax have no school fields in the
current schema. City/ZIP lines remain together in the city field; state/postal
fields are left empty rather than guessed.

This is a historical replay snapshot with acknowledged incomplete source data,
not an assertion that every entry passes today's finalization checks. Lifecycle
is deliberately finalized as requested; incomplete inputs are not replaced by
fabricated scores or grades. Qualification analysis is provisional until the
reported omissions and unknown inputs are corrected.

- Unresolved play-up names remain in the report; annual students require an
  actual grade, so no replacement student or guessed grade is created. The
  corresponding entries keep known members and scores, with missing members
  identified in the report.
- When both base and play-up rows assign the same student to the same team,
  one membership is stored with the explicitly entered higher competing grade.
  Both original rows remain in the extraction and the adjustment is reported.
- Parts outside 0–75 are withheld from the result fields and preserved in the
  report/audit. A missing second topical part remains null. In particular,
  Virtual's first-column-only scores require clarification before complete
  topical rankings can be reproduced. No combined score is split or invented.
- Knowdown results link only exact normalized school/student matches from the
  extraction. Entered placements can create a missing participation record.
  An alternate is stored internally as fourth place, which the existing
  qualification rules treat as an inactive alternate. Unplaced marked entrants
  are recorded as eliminated only when all entered placement identities in the
  region resolve; otherwise their outcomes remain unknown for correction.
- JV team-problem entries are excluded and recorded with their original data:
  the app currently has no separate JV category and would rank them alongside
  varsity entries. They are never silently relabeled as varsity.
- An unnamed school/roster row is excluded with its full input retained.
  Assumed individual topical entries with no entered score are also excluded;
  absence of a team number alone does not prove they took the individual test.
- Existing spellings and other markers, including asterisks, are retained;
  they are not used to infer additional identities or actual grades.
- Historical assignments that violate today's team-size, distinct-grade,
  one-entry-per-category, or topical-exclusivity rules are retained and flagged
  in the report for correction rather than silently dropping team members.

## Corrections and verification

Correct source identities/grades in the extracted data (or a reviewed future
reconciliation layer) and regenerate the seed for a repeatable replay. Reseeding
replaces local changes. For corrections in the application, reopen the regional
contest from Scoring before changing results, then finalize it again. Unknown
student identities/grades may require reopening registration through the normal
program workflow. Finish corrections before publishing qualification decisions.

Run `npm run test:2026-results` to generate SQL and load it into a fully migrated,
isolated SQLite database. It checks replay stage, empty qualification decisions,
source-score persistence, independent mixed teams, play-up identity, unresolved
data retention, and replacement of archived history. The seed
runner itself is also exercised against local Wrangler D1 before delivery.
