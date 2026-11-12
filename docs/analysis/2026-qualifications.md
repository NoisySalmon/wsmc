# 2026 qualification planning

Reference: `State Math/2026/Statewide Regional Results 2026.pdf`, all six
pages. The first page specifies inclusive minimum scores and says all Projects
qualify. The planner represents that Project policy with a cutoff of 0:

| Category | Combined | Division I | Division II |
| --- | ---: | ---: | ---: |
| Project | 0 | — | — |
| Team Problem (app: Team Contest) | — | 14 | 10 |
| Topical Team | — | 89 | 68 |
| Topical Individual | 50 | — | — |

The example seed persists these values in an editable cutoff draft. The UI
uses saved values and has no historical-reference preset, reset button, or
population target. Team additions show student names. The overall population
still deduplicates known students across entries and events.

Project, Topical Individual, and Knowdown have no competitive divisions.
Topical Individual grade ranks span school divisions. Automatic Individual
qualification first selects the regional overall top three (including ties),
removes them from the pool, then selects the highest remaining score in each
actual grade (including ties) as distinguished freshman, sophomore, junior, or
senior. Each student gets one automatic basis; cutoff additions apply only to
entries not already automatically qualified. Distinguished selection does not
change the public grade leaderboard. Saved legacy cutoff pairs
with equal values load as one cutoff; conflicting pairs are blanked and flagged
for review. School division metadata remains intact. Team Contest and Topical Team
automatically qualify regional first place in each division (including ties),
then add other entries meeting the statewide cutoff.

The counts below predate the division correction and reviewed Knowdown identity corrections. See
[2026 reconciliation](2026-reconciliation.md) for current findings and remaining gaps.

## Imported-data reconstruction

Computed with the application ranking, placement, and cutoff functions against
an isolated D1 database seeded by `generate-2026-results.mjs`:

- 53 schools, 517 annual students, 535 entries; all 11 regionals finalized.
- 184 active automatic event entries covering 243 unique known students.
- The reference cutoffs add 66 event entries, reaching 83 more unique students.
- Combined: 250 eligible event entries covering 326 unique known students.
- Inactive Knowdown alternates are excluded from automatic population counts.
- Students are deduplicated by annual student ID across all team memberships
  and individual events. Multiple reasons never multiply a student count.

| Event | Division | Automatic entries | Cutoff additions | App total | PDF listed teams |
| --- | ---: | ---: | ---: | ---: | ---: |
| Team Contest | I | 29 | 25 | 54 | 37 |
| Team Contest | II | 28 | 10 | 38 | 31 |
| Topical Team | I | 24 | 17 | 41 | 39 |
| Topical Team | II | 26 | 9 | 35 | 27 |
| Topical Individual | I | 30 | 5 | 35 | — |
| Topical Individual | II | 20 | 0 | 20 | — |

The PDF's individual list is arranged by grade, not division. Do not equate
event-entry counts with students or sum team-member slots as attendance.
The PDF's team counts were read from its four team tables (pages 2–5).
These counts do **not** reconcile with the imported reconstruction; no claim
is made that the app currently reproduces the historical invitation list.
An identity/entry-level reconciliation remains necessary before treating the
historical replay as authoritative. The planner explicitly warns of this.

## Known limits and policy questions

- The PDF says **all Projects qualify**. Project has one shared
  score cutoff defaulting to 0, so every scored Project qualifies through
  placement or cutoff. Unscored Projects still need review. Raising or disabling
  the Project cutoff retains automatic top-three placement qualifiers.
- In the seed, 19 Topical Team entries, 3 Topical Individual entries, and 1 Team
  Contest entry have no total score. Knowdown has outcome/placement rather
  than a numeric score. Virtual topical results are incomplete in the source
  import; missing second parts are not guessed. The seed report also records
  unresolved students, play-ups, and other incomplete records.
- Automatic eligibility is computed from current finalized regional boards,
  with saved published placements preserved. This works before any draft has
  been generated, so starting with an empty qualification table does not
  misclassify automatic qualifiers as cutoff additions.
- Manual include/exclude decisions are reviewed separately and are not included
  in the scenario population estimate. The planner says so explicitly.
- Known regional members estimate invitation reach. Qualified team berths allow
  different state members, and schools may decline attendance. This is not a
  prediction of actual attendance or a capacity guarantee.
- Blank disables a cutoff; zero includes all rankable scored entries. Equal
  scores qualify together, even if that takes the population beyond a target.
  Lowering scores cannot remove automatic qualifiers.

## Workflow and persistence

Home → **Plan and review qualifications** opens the coordinator-only page.
There is one editable qualification draft. **Save draft** refreshes automatic
placements and cutoff additions together in one atomic batch; separate
regional generation and publication actions have been removed.

**Publish qualifications and open state contest** publishes the saved snapshot
without recalculating it and advances the season to `state` in one transaction.
All regionals must be finalized, and the season must be in the qualification
stage. Save any cutoff changes or manual exceptions before publishing; pending
exceptions that have not been applied to the complete list block publication.
Drafts remain editable until publication; there is no separate Freeze step.
Previously frozen, unpublished drafts load as editable drafts, and saving resets
their rounds to draft. Published lists remain locked. Subsequent regional score
changes record an impact-review audit event for published decisions.
Existing published legacy placement rounds are preserved when completing
statewide additions. The saved review shows scores for scored events, with
exclusions identified in Basis; Knowdown retains its Decision column.

## Entry counts and population counts

The cutoff table reports Project entries, team entries, or individual entries
according to the event. Each automatic/addition/eligible cell also expands
those entries through known regional memberships and reports unique students
within that event (and division for Team Contest and Topical Team). Knowdown appears with placement-only eligibility.
A student appearing in automatic and cutoff-added teams counts once in the
eligible column. A student appearing in several events counts once in the
overall population. Per-event student counts and automatic plus cutoff
student counts must not be summed.

## Verification

`npm run test:qualifications` exercises real D1 storage with the full 2026
fixture: persisted cutoff defaults, named members, combined automatic/cutoff
saving, stricter-cutoff replacement, incomplete-region publication rejection,
legacy frozen draft editing, pending-exception checks, score display data,
no pre-publication exposure, publication of the
unchanged snapshot, and the state-stage transition. It uses a disposable
Miniflare database and never reseeds the application's local database.
