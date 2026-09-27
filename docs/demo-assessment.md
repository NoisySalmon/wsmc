# Readiness for an admin feedback tour

Reviewed September 27, 2026, against commit `6c822f9`, with local follow-up
changes on September 27. See
[the recording scripts](demo-scripts.md).

## Recommendation

Engage the overall contest admin now. There is enough working structure to
discuss whether the app fits their job: annual setup, school participation,
registration, scoring, qualification review, and state attendance/entries.
Use a guided demonstration with fictional data. Offer a supervised rehearsal
with a past contest as the next step. An independent trial or live contest
replacement is premature.

The strongest value proposition is carrying the same roster and result records
through the regional-to-state handoff, with validation and review along the
way. CSV lets people continue some spreadsheet work. Whether this actually
saves time is a hypothesis to test with the admin; this review did not compare
the app against an actual workbook task by task.

## Evidence and limits

This assessment compares current source code, product requirements, and the
three user guides. The local follow-up passed 142 tests across 39 files,
`npm run check` with zero errors or warnings, a production build, D1
integration checks, the 24-school dress rehearsal, and an authenticated Pages
preview. A headless Chrome walkthrough rendered the contest overview, regional
results, regional coordinator stage control, coach school page, and scorekeeper
scoring page. These checks do not establish contest-day usability or reconcile
the app against a real workbook.

The live Pages project was verified separately: production uses the v2 D1
schema and has the required text settings and encrypted email key. Commit
`6c822f9` is deployed to `https://wsmc.pages.dev`. The production database has
the fictional demo fixture (3 schools, 9 students, 15 entries, and 9 scoring
rows), plus the coordinator account used for the walkthrough.

The follow-up reproduced the Region 2 scoring 500 locally while that contest
was in `registration_open`. The scoring loader fetched a snapshot before it
checked lifecycle or authorization. The local fix returns 409 to authorized
staff before roster lock and 403 to unrelated users. An authenticated Pages
preview now checks statewide, regional-only, coach, and scorekeeper paths,
including Region 2 stage changes, finalization, publication, and contest
overview access. Direct Region 2 scoring now shows a stage explanation; its
scoring link appears once rosters are locked. The production site has not been
redeployed with these changes.

## What is worth showing

| Admin concern | Concrete demonstration | Claim to evaluate |
|---|---|---|
| Annual setup is scattered | Program, school directory, participation and user assignments | One place to establish the season and responsibilities |
| Rosters arrive in inconsistent forms | Annual students → contest roster → category entries; reject an invalid team | Catch entry mistakes before score entry |
| People prefer spreadsheets | Registration and score CSV download, preview and import | Preserve familiar data entry while reducing reconciliation |
| Contest scoring is stressful | Category/division filters, missing results, explicit zero, editor/version | Make omissions and conflicting edits easier to notice |
| State invitations take manual work | Qualification draft, reasons, division cutoffs, published rounds | Make the regional-to-state selection reviewable |
| State attendance changes | Qualified-school attendance and explicit roster admission basis | Keep qualification, attendance and actual state entries connected |

## Fixes and unresolved workflow issues

The local follow-up added a contest overview, a season-aware region selector,
regional coordinator controls for roster lock and scoring, and contest-scoped
scorekeeper management. Coaches can respond to school invitations from **My
schools**. Program can no
longer finalize a contest directly; Scoring checks completeness, and Publish is
separate. Coaches can see finalized regional results only after publication.
These changes passed automated HTTP checks and a rendered local browser
walkthrough, but have not been deployed.

The remaining items are source findings, not a claim that every issue was
reproduced in a browser.

| Priority | Finding | Consequence / action |
|---|---|---|
| Knowdown final outcomes | Scoring records each entrant as placed 1–4 or eliminated; finalization requires all outcomes and rejects duplicate places. The six-person local fixture shows four places and two eliminations. | This records the final ordering without detailed round history. Confirm that final outcomes match the actual event before publishing. |
| Contest coverage | The contest overview counts eliminated Knowdown entrants as complete and shows the full roster and entries. | Use the overview to compare the number of registered entrants with their recorded final outcomes. |
| Before inviting coaches to explore | Coaches can now see assigned school participation, respond to invitations, and open registration from **My schools**. | Rehearse the first coach sign-in and check that each assignment and contest appears as expected. |
| Before a regional pilot | Regional-only coordinators can now respond for schools, lock rosters, start scoring, assign scorekeepers, and download participation CSV. | Rehearse the full handoff with a coordinator and scorekeeper before claiming the role split works on contest day. |
| Before a state pilot | Cross-school Topical Team setting is present, but the entry service rejects an ownerless entry unless it is Team Contest. | Implement the policy or remove the unsupported choice. Do not demonstrate cross-school Topical Teams as available. |
| Before a state pilot | Coach view hides team-berth records; new replacement students cannot be created from State administration. | Rehearse substitutions and establish who performs each step. Provide an annual-student creation path when regional registration is closed. |
| Before routine exception handling | Manual qualification decisions require internal entry/student IDs. | Add searchable choices. Avoid presenting this as an easy admin task today. |

Source pointers: [Program UI](../src/routes/program/+page.svelte),
[lifecycle service](../src/lib/server/program/service.ts),
[contest overview](../src/routes/contests/[contestId]/+page.svelte),
[scoring service](../src/lib/server/scoring/service.ts),
[regional result access](../src/routes/results/[contestId]/+page.server.ts),
[navigation](../src/routes/+layout.svelte),
[regional guide](user-guides/regional-coordinator.md),
[coach guide](user-guides/coach.md),
[state entry service](../src/lib/server/state/service.ts),
[coach state scope](../src/lib/server/state/access.ts),
[qualification UI](../src/routes/qualifications/[seasonId]/+page.svelte).

## Demo data needs attention

The local seed now uses distinct competing grades in teams and avoids entering
the same student in both Topical Team and Topical Individual. The cross-school
state team also uses distinct grades. It supplies separate statewide,
regional-only, coach-only, and scorekeeper accounts. Region 1 is finalized and
its regional qualification round is published, including the Knowdown top three
and inactive fourth-place alternate; Region 2 is open for coach
registration and can be moved into scoring from the contest overview for a
later chapter. This is a
guided-demo fixture with six Knowdown entrants: places 1–4 and two eliminated.
Detailed elimination rounds are not recorded.

Use the seeded distinct admin, regional-only, coach-only, and scorekeeper
accounts so broad admin permissions do not hide navigation or authorization
gaps. Keep the regional editing and finalized-results scenes separate. The
Knowdown scene can demonstrate final outcomes and alternate qualification; it
does not show round-by-round elimination tracking.

## Adoption questions and next commitment

Ask about their last contest before showing features:

1. “Walk me through the files you received and the work you did to turn them
   into regional results and state invitations. Where did you have to fix things?”
2. “Who owns each deadline and correction? What do you need to see to know a
   region is ready?”

After the tour, ask for a concrete example:

1. “Show me a substitution, tie, withdrawal, or late correction from last year
   that this workflow would need to handle.”
2. “Which spreadsheet would you still need, and what job would it be doing?”
3. “Would the separate student list, roster, and event entries be clear to your
   coaches? Where would they need help?”
4. “What would have to change before you would try this with one region?”
5. “Could we replay a past contest with you, one regional coordinator, and one
   coach, then compare the results and qualification lists?”

Confirm current competition and qualification rules with the admin; the old
`SPEC.md` differs from the current product requirements, including tie and
actual-grade qualification rules. Ask specifically about internet reliability,
Knowdown nonplacers, publication timing, state replacements, printing, and
fees. Offline operation, legacy workbook import, payments, automatic annual
roster rollover, and specialized print artifacts are outside the current
release scope; their importance is an adoption question.

For the past-contest rehearsal, success means the participants can perform
their own assigned tasks, results and qualifiers match the agreed rules, and
every remaining spreadsheet has an understood purpose. Record each failure
with its actor, task, workaround, and whether it blocks a pilot. End with a
named trial owner and a small agreed scope, rather than a general “looks good.”
