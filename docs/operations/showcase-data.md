# 2026 showcase data and production bootstrap

`npm run seed:showcase` replaces the persistent **local** development database.
`npm run demo:preview` loads the same showcase into a fresh temporary database.
Neither command can select a remote target. Automated checks continue to use
`scripts/seed.sql`, which intentionally retains its small synthetic fixture.

## Real directory and provenance

`scripts/data/wsmc-directory-2026.json` is the reusable source of truth:

- All ten numbered regions and Virtual come from the [WSMC locations page](https://www.wsmc.net/hs-contest-locations)
  and its embedded locations document, reviewed October 26, 2026.
- Forty schools, their divisions, and regional participation come from the
  Division I/II Team Problem and Topical Team tables in the supplied
  `State Math/2026/Statewide Regional Results 2026.pdf`. Its SHA-256 is recorded
  in the JSON. The supplied report is local/ignored, so a clean checkout does
  not need access to it to regenerate the showcase.
- The [WSMC history page](https://www.wsmc.net/hs-contest-1) is the public entry
  point for historical results. The local regional report includes more
  participating schools than the public winners summary.
- Division I covers WIAA 4A, 3A and 2A; Division II covers 1A, 1B and 2B.
  The data stores the report's division, without guessing an individual
  school's exact WIAA classification.

This is a sourced subset of contest participants, not the entire Washington
school directory. School names retain the report's labels (for example,
Lincoln and Liberty); full legal names, cities, addresses and contact emails
are left unasserted. Resolve those identities before merging with a larger
directory in production.

The report lists Klahowya under 10, 11 and 9. The showcase uses 10, its first
Team Problem row and the Peninsula host region. Other schools use their first
team-table region; `V` maps to 11. This resolves the source inconsistency for
the demo and requires coordinator confirmation before production participation
is created. No school-to-region participation is imported by directory-only SQL.
The current locations page lists 2027 venues; no 2027 venue is asserted as a
2026 site. March 11 regional dates are illustrative. The April 18 state date
comes from the supplied 2026 report.

## Fictional demonstration data

The generated showcase creates 40 coaches, 11 regional coordinators and one
statewide coordinator with `.example` emails, plus 320 fictional annual
students. It does not reuse historical student or staff names. There are no
scorekeeper users or assignments. Each school outside a setup region has eight
rostered students and 16 entries across all five categories, with distinct
competing grades on teams and no Topical Team/Individual overlap.

| Region | Contest state |
|---|---|
| 1 Spokane | Finalized and published, complete scores |
| 2 Tri Cities | Registration open |
| 3 North Central | Rosters locked, ready to score |
| 4 Yakima | Setup, schools invited |
| 5 Northwest | Scoring, missing results and partial topical scores |
| 6 Seattle | Registration open |
| 7 Tacoma | Finalized, complete scores, publication pending |
| 8 Southwest | Scoring, missing results and partial topical scores |
| 9 Olympia | Registration open |
| 10 Peninsula | Setup, schools invited |
| 11 Virtual | Registration open |

State is in setup. There are no qualification snapshots or state rosters yet,
because several regionals are unfinished. Demo results are deterministic,
fictional, and never represented as historical scores. Each completed contest
has four unique Knowdown places and explicit eliminated outcomes for the rest.

## Later production import

Generate an additive directory-only SQL file:

```bash
node scripts/generate-showcase.mjs --directory /tmp/wsmc-directory-2026.sql
```

This file contains only the 2026 season, region names and school directory.
It contains no DELETEs, contests, participation assignments, users, students,
scores or qualifications. Existing seasons match by year, regions by season
and number, and schools by ID or trimmed case-insensitive name/short name.
Existing rows are preserved, including their division; repeated imports do
not insert the same exact names again. Different spellings and ambiguous
names require manual reconciliation; this is not a general identity matcher.

Before a production import, export D1 per [the runbook](d1-runbook.md), inspect
the actual production schools/regions, reconcile aliases and identities, and
review conflicting divisions against the source and current classification.
Generate a reviewed SQL file with any required ID/name corrections, apply it
to a restored copy first, and compare counts and assignments. Production has
not been inspected or changed by this task. Do not run the destructive showcase
SQL or `scripts/reset-v2.sql` against production.
