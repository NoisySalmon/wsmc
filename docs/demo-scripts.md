# Guided demo — regional contests in progress

Updated November 5, 2026 for the real-region, real-school showcase and current
coach worksheet. Allow 10–12 minutes, plus discussion. These are spoken scripts
and screen directions checked against the showcase generator and UI source;
rehearse the selected actions in the browser before presenting.

## Prepare the three roles

Use the existing local showcase. The running Vite server is normally at
`http://localhost:5173`; use `npm run dev` for rehearsals with persistent data. The reusable local
sign-in links below switch accounts automatically; no email or sign-out step
is needed. They work only on a loopback Vite development server and are
disabled in production builds. Normal emailed sign-in remains available at `/login`.

| Chapter | Account | Reusable local sign-in | Starting screen |
|---|---|---|---|
| State admin | `coordinator@wsmc.example` | [State admin](http://localhost:5173/auth/demo/state) | Home `/`, then `/program` |
| Regional admin | `regional5@wsmc.example` | [Northwest admin](http://localhost:5173/auth/demo/regional) | `/contests/contest-region-5` — Northwest |
| Coach | `coach.hanford@wsmc.example` | [Hanford coach](http://localhost:5173/auth/demo/coach) | `/my-schools`, then `/registration/contest-region-2/school-hanford` |

The directory has 11 regions and 40 real schools. The 320 students, staff
accounts, scores and regional dates are fictional. This is a staged picture of
contests at different points, not a live report of the actual 2026 season.
There are no scorekeeper accounts, qualification snapshots or state rosters.

Use three existing examples, rather than advancing one contest through the
entire lifecycle. Keep Northwest in scoring and Tri Cities open for registration
so each chapter remains available for another rehearsal.

## Opening — the statewide picture (30 seconds)

**Screen:** Home, signed in as the statewide coordinator. Show the region list.

**Say:**

> “This is a demonstration season using real Washington regions and schools,
> with fictional students and results. I've put the regions at different stages
> so we can look at the work each person does.
>
> I'll start with managing the overall program, then switch to a regional
> coordinator entering scores, and finish as a coach preparing a school team.
> I'd like to see where this fits your process and where it needs to change.”

## Chapter 1 — State admin: oversee the program (3–4 minutes)

### 1. See where the regions stand

**Show:** On Home, point to Yakima (Setup), Tri Cities (Registration open),
North Central (Roster locked), and Northwest (Scoring). Spokane and Tacoma are
both Finalized; publication is a separate distinction, visible inside their
contest/results screens. The state contest is still in Setup.

**Say:**

> “The season contains the regional contests and one state contest. Setup means
> a contest is being prepared. Registration open lets coaches enter their teams.
> Roster locked closes those edits, and scoring is when staff enter results.
> Finalized means those results have been locked for review; publishing them
> to school users is a separate action.
>
> Here Northwest is scoring while Tri Cities is still accepting registrations.
> The state contest hasn't opened yet.”

### 2. Manage contest setup and responsibility

**Show:** **Set up regions + state contest** → `/program`. Find Northwest's
region row: region identity, contest date, coordinator assignment, and links
to overview and staff. Then show the state contest's date and settings.
Do not create another season or advance a contest during this overview.

**Say:**

> “The statewide administrator manages the season structure, contest dates and
> who coordinates each region. Adding a region creates its contest; the state
> contest is managed here too. I can open a regional overview or manage its
> staff without keeping separate lists for each region.
>
> Creating the next season is available here, but today we're looking at a
> season already in progress.”

Keep cross-school Topical Teams disabled; that workflow is unfinished. Do not
make it part of the demonstration.

### 3. Connect schools, people and participation

**Show:** **Schools** (`/schools`), find Hanford. This directory supports adding
schools, changing their default division, and marking them inactive; it does not
have a school-detail editor. **Users** (`/admin/users`) shows accounts and their
coach, regional, and statewide assignments. Users requires system-wide coordinator
access. Then open **Regions**
(`/regions`) to find Hanford's regional assignment in Tri Cities,
Division 1, and its coach assignment. Inspect existing records rather than
changing a region assignment.

**Say:**

> “Schools are shared directory records. A person's assignment determines what
> they can manage. Participation records which contest a school is entering,
> its division, and its invitation response.
>
> Hanford is already participating in Tri Cities. Later I'll sign in as its
> coach and show the team worksheet. These are connected records, so the coach
> doesn't need a separate account for every student.”

**Close / transition:**

> “Does this give you the overview you need to manage the program? What would
> you need to know about a region before calling its coordinator?
>
> Now I'll switch to the Northwest coordinator, whose contest is already scoring.”

## Chapter 2 — Regional admin: find and complete missing scores (3–4 minutes)

**Account:** `regional5@wsmc.example`. The reusable link opens scoring; use
**Contest overview** to start this chapter. This is a regional-only account, not the
statewide administrator continuing with broader permissions.

### 1. Start with the contest overview

**Show:** `/contests/contest-region-5`. Point to participating schools, student
and entry counts, and score coverage. Northwest includes Anacortes, Cascade,
Henry M Jackson, Kamiak, King's, Mariner and South Whidbey.

**Say:**

> “I'm now responsible for Northwest. The overview shows what the schools have
> entered and how much scoring remains. Registration is already closed for this
> contest, so coaches aren't changing the roster while we enter results.”

### 2. Complete one topical result

**Show:** `/scoring/contest-region-5`. Select **Topical Individual**, then
**Missing only**. Choose an Anacortes entry with Part 1 filled and Part 2 blank
(the fresh showcase has this on entry 2). Note its student name before editing.
Keep the existing Part 1 and enter **65** for Part 2; press **Save**.
If that entry was completed during rehearsal, choose another partial topical
entry; do not depend on the same row remaining missing.

**Say:**

> “I can filter by event and division, or show only missing results. This entry
> has its first part but is still incomplete. I'll enter the second part and
> save. The app totals the two parts and records the editor and version.”

**Show:** After saving, the filters stay selected. With
**Missing only** enabled the completed entry is excluded. Turn it off and find
the noted student to show both parts, their total, and the saved version.
Do not promise a total of 125: Part 1 comes from the fixture.

> “A blank means work is still missing; zero is an actual score. Enter scores directly in the scoring worksheet.”

### 3. Explain the completion checkpoint

**Show:** Select **Knowdown** to show placed, eliminated and missing outcomes.
Then scroll to **Contest controls** and its missing-result explanation.
Leave **Finalize results** unsubmitted: Northwest intentionally has other gaps.

**Say:**

> “For Knowdown, this records the final outcome—placed or eliminated—not the
> round-by-round bracket. Places one through four must be unique across the
> contest.
>
> Northwest still has missing results, so it isn't ready to finalize. Once
> everything is complete, finalization locks scoring. Publishing is a separate
> step, and corrections after finalization require reopening with a reason.”

**Optional, if asked what finished results look like:** In the state-admin
chapter, or after explicitly switching back to that account, open
`/results/contest-region-1` for Spokane's already published results. Label this
as a different, prepared contest. Do not imply Northwest was just completed,
or expect the Northwest-only account to have Spokane access.

**Close / transition:**

> “Would this help you find unfinished scoring on contest day? What correction
> or exception should we try against a past contest?
>
> Next I'll switch schools and stages: Hanford's coach in Tri Cities, where
> registration is still open.”

## Chapter 3 — Coach: configure the school team (3 minutes)

**Account:** `coach.hanford@wsmc.example`. The reusable link opens the worksheet;
use **My schools** to start this chapter.

### 1. Open the team's worksheet

**Show:** `/my-schools`, Hanford's regional assignment, then its registration
link. On the **Who's doing what?** worksheet, point out **Registration open**,
Attendance, Team Contest, Topical, Project and Knowdown.

**Say:**

> “I'm now Hanford's coach. I manage my school's students and contest choices.
> Each row brings together attendance, team assignments, topical event and
> Knowdown nomination. Students don't need to sign in.
>
> Team Contest, Topical and Project teams are independent. Teams have up to
> three students with different competing grades, and students can compete at
> their actual grade or above.”

### 2. Choose Knowdown nominees and save

**Show:** On a fresh showcase Hanford has eight Knowdown boxes checked. The
worksheet permits at most three nominees and disables **Save contest** above
that limit. Uncheck five, retaining the first three students as nominees.
Press **Save contest**, check for success, then reload to confirm persistence.
This deliberately changes Hanford's contest entries; it does not delete students.

**Say:**

> “The sample starts with all eight students entered in Knowdown. As coach,
> I'll choose the three nominees for this contest. The worksheet prevents me
> from saving more than three. Now I save, and these choices are recorded.”

**Repeat rehearsal:** If only three are already checked, swap one nomination
from a checked student to an unchecked attending student, keep the total at
three, and save. Keep everyone attending for this simple example.

### 3. Show student maintenance and the deadline

**Show:** **Edit student details**, then the **Add a student** fields without
submitting. Point out the actual-grade field and registration CSV controls.
Avoid adding extra students on every rehearsal.

**Say:**

> “I can maintain student names and actual grades, or add someone new. The
> worksheet includes a newly added student in this contest, and I choose their
> events here. There's also a registration CSV option for spreadsheet users;
> it uses the app's template, with preview before import.
>
> When the coordinator locks registration, this becomes read-only. I would
> contact the coordinator for a correction. I don't enter regional scores.”

**Close:**

> “For a coach who does this once a year, are the event choices clear? Would
> you use this worksheet, the CSV, or ask someone else to enter the team?”

## End with the next conversation (30 seconds)

> “We've seen the statewide setup and responsibilities, a coordinator finishing
> scores, and a coach preparing a team. State qualifications and attendance come
> later; this demo hasn't generated those yet.
>
> Could we replay one past regional contest with a coordinator and a coach,
> compare the entries and results with your records, and identify what would
> need to change before a pilot?”

## Rehearsal notes

- Confirm the three accounts, routes and selected scoring entry before the demo.
  This document is not evidence of a completed browser rehearsal.
- The two live edits are one Northwest topical score and Hanford's Knowdown
  selections. The state-admin chapter inspects existing records. No real
  invitations need to be sent, and no contest needs to change stage.
- The existing local database preserves edits. Do not reseed just to repeat the
  talk. `npm run seed:showcase` replaces all local application data; use it only
  when intentionally resetting. `npm run demo:preview` provides a separate,
  disposable showcase, removed when that server stops.
- The stage map and directory provenance are in
  [showcase data](operations/showcase-data.md); startup details are in
  [local development](operations/local-development.md).
- The older [readiness assessment](demo-assessment.md) includes the former small
  fixture and earlier coach UI. Use this script and the showcase guide for
  current screen directions. Do not promise offline use, arbitrary legacy
  workbook imports, automatic qualification notifications, or completed
  cross-school Topical Team workflows.
