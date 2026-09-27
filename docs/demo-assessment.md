# Readiness for an admin feedback tour

Reviewed September 27, 2026, against `e97ea31` plus the local demo-readiness
changes. See [the recording scripts](demo-scripts.md).

## Recommendation

Engage the overall contest admin now. There is enough working structure to
discuss whether the app fits their job: annual setup, school participation,
registration, scoring, qualification review, and state attendance/entries.
Use a guided demonstration with fictional data. Offer a supervised rehearsal
with a past contest as the next step, after the critical scoring issues below
are addressed. An independent trial or live contest replacement is premature.

The strongest value proposition is carrying the same roster and result records
through the regional-to-state handoff, with validation and review along the
way. CSV lets people continue some spreadsheet work. Whether this actually
saves time is a hypothesis to test with the admin; this review did not compare
the app against an actual workbook task by task.

## Evidence and limits

This assessment compares current source code, product requirements, and the
three user guides. Local checks passed: 124 tests across 34 files, `npm run
check` with zero errors or warnings, a production build, D1 integration and
dress-rehearsal scripts, and a Pages local-server walkthrough. The walkthrough
loaded Program, Schools, Users, Participation, Qualifications, State
administration, Scoring, Results, and coach Registration pages. It also
verified the navigation shown to statewide, regional, coach, and scorekeeper
accounts. These checks do not establish contest-day usability or reconcile the
app against a real workbook. No browser-based visual review was possible in
this session.

The live Pages project was verified separately: production uses the v2 D1
schema and has the required text settings and encrypted email key. The current
application changes are being committed and deployed after this local review.

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

These are source findings, not a claim that every issue was reproduced in a browser.

| Priority | Finding | Consequence / action |
|---|---|---|
| Before trusting scores | Knowdown completeness requires a placement on every registered Knowdown entry, while only 1–4 are allowed. Duplicate placements are not rejected. | A normal field larger than four cannot be represented faithfully and finalized through the normal scoring flow. Define nonplacing competitors and validate the ordered finish. Never invent placements to make the demo complete. |
| Before independent use | Program can set `finalized` directly, without the scoring completeness check, and sets the publication timestamp at the same time. | Route finalization through the scoring service and keep publication separate. In the tour use **Finalize results** on Scoring only. |
| Before independent use | Regional results check season coach access and finalized status, but do not require publication. | Decide and enforce the intended review embargo; do not promise that regional results remain hidden until Publish. |
| Before a self-service setup demo | New contest requires a Region ID that Program does not display. | Replace with a region selector. Until then, show prepared contests and explicitly disclose the assisted setup step. |
| Before inviting coaches to explore | Role menus now show assigned scoring or registration links. Coaches still cannot open Participation to respond to school invitations. | The statewide or regional coordinator must record school acceptance or decline. A coach's Registration link appears when their assigned school has a participation row for a regional contest. |
| Before a regional pilot | Regional-only users can now navigate to assigned scoring and Participation, but cannot advance initial lifecycle states or assign scorekeepers. Participation still exposes response/export controls they cannot use. | Have the statewide admin handle lifecycle changes and scorekeeper assignments during a supervised rehearsal. |
| Before a state pilot | Cross-school Topical Team setting is present, but the entry service rejects an ownerless entry unless it is Team Contest. | Implement the policy or remove the unsupported choice. Do not demonstrate cross-school Topical Teams as available. |
| Before a state pilot | Coach view hides team-berth records; new replacement students cannot be created from State administration. | Rehearse substitutions and establish who performs each step. Provide an annual-student creation path when regional registration is closed. |
| Before routine exception handling | Manual qualification decisions require internal entry/student IDs. | Add searchable choices. Avoid presenting this as an easy admin task today. |

Source pointers: [Program UI](../src/routes/program/+page.svelte),
[lifecycle service](../src/lib/server/program/service.ts),
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
its regional qualification round is published; Region 2 is open for coach
registration and can be moved into scoring for a later chapter. This is a
guided-demo fixture, not a full Knowdown field or proof that every policy
exception works.

Use the seeded distinct admin, regional-only, coach-only, and scorekeeper
accounts so broad admin permissions do not hide navigation or authorization
gaps. Keep the regional editing and finalized-results scenes separate. A tiny
Knowdown fixture may illustrate result entry, but must not be offered as proof
that the full event works.

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
