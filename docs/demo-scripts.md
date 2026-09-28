# Guided tour scripts — first admin conversation

Draft for the current implementation, September 26, 2026. Read the
[readiness assessment](demo-assessment.md) before recording. These are spoken
scripts with screen directions, not a claim that the demo has been rehearsed.

## Recording approach

Make three short chapters that also work as separate clips. Aim for about
3 minutes each, allowing time for the screen actions. Add the optional state
handoff chapter when the admin wants more detail. For the first conversation,
open with a prepared qualification review to establish the payoff, then show
how the records get there. Do not spend the opening minute typing setup forms.

Use a disposable demo environment and fictional schools/students. Prepare
valid, populated screens, with one simple edit to perform in each chapter.
State visibly when switching roles or moving to a prepared later stage.
Keep the prototype caveats in the narration; a cut must not imply an
unsupported transition worked automatically.

### Shared opening — about 30 seconds

**Screen:** A prepared qualification review showing Category, School and Reasons.

**Say:**

> “I've been building a way to carry school registrations through regional
> scoring and into state qualification. Here is the outcome: a list you can
> review, including why each entry qualified.
>
> I want to see whether this matches the work you actually do and where it
> could save you time. There are still unfinished steps, which I'll point out.
> I'll show annual setup, a regional contest, and the coach's part of the work.”

## Script 1 — Setting up the year's contest cycle

**Account:** System-wide coordinator. **Screens:** Program → Schools → Users → Participation.

### 1. Establish the season

**Show:** `/program`, **New season**, then a populated season with its regions
and state contest.

**Say:**

> “The year is organized as one season, with numbered regions, a contest for
> each region, and a state contest. Schools live in a shared directory, while
> participation and divisions are recorded for the particular contest.
>
> You create the season here. I've already prepared the regions and contests
> so we can look at the whole structure. Adding a region creates its regional
> contest automatically, and there is one state contest per season.”

**Show:** State policy selectors on the season card; use a prepared contest with cross-school
Topical Teams disabled.

> “There is also a state policy for whether all state-rostered students can
> enter Topical Individual. I'd want you to confirm that choice. The
> cross-school Topical Team option is visible, but its workflow is unfinished.”

### 2. Give people responsibility

**Show:** **Schools**, an existing fictional school; **Users**, Assignment selector.
Demonstrate the choices without sending real invitations.

**Say:**

> “The school directory is reused across seasons. Access is assigned separately:
> you can have a statewide administrator, a coordinator for a particular
> regional contest, school coaches, and scorekeepers assigned to a contest.
> One person can have more than one responsibility.”

### 3. Establish participation and open registration

**Show:** **Participation** → **Invite a school**; record one fictional school's
participation and division. Show **Invite a coach** separately.

**Say:**

> “Here you record which school is invited to which contest and its division.
> Sending a coach a sign-in invitation is a separate step. Sign-in uses an
> emailed link.
>
> The coach can accept or decline from **My schools**. A regional coordinator
> can also record a response for an uncoached school. The coach's navigation
> shows a registration link for each assigned school with a participation
> record in a regional contest.”

**Show:** Program season readiness and outstanding invitations. On a prepared
setup contest, choose `registration_open` and **Update**; do not use `finalized`.

> “Program shows missing regional contests and outstanding invitations. ‘Setup
> ready’ checks the contest structure; it doesn't mean every school or roster
> is ready. Opening registration allows coaches to work on their entries.
> Activating the season and opening each contest are separate controls.”

**Close:**

> “For your annual setup, which information is missing here? And which of
> these tasks would you expect a regional coordinator to do without you?”

## Script 2 — Running a regional contest

**Accounts:** Regional-only coordinator, then statewide coordinator for
qualifications. **Screens:** Contest overview → Registration → Scoring → Results.
Use the assigned contest's Overview link in the coordinator's navigation.

### 1. Check what the schools are bringing

**Show:** The contest overview's school counts, rostered students, registered
entries and score coverage. Open a prepared school registration page from its
school row, including roster and category entries.

**Say:**

> “Each school selects the students attending and enters them in the events:
> Project, Team Contest, Topical Team or Individual, and Knowdown. The team
> entries include the members and their competing grades.
>
> The overview shows how many schools, students and entries are in this contest,
> including the Knowdown field. That gives the coordinator the entries that will
> need scores. The event itself still runs in person, with people judging or
> marking the work.”

**Show:** On the regional coordinator's contest overview, lock rosters and
then start scoring. Use the prepared scoring example if its entries differ.

> “When registration is ready, I lock the roster and move this contest into
> scoring. The regional coordinator can make those stage changes and manage
> scorekeepers for this contest. We will not send a real invitation in this
> recording.”

### 2. Enter and check results

**Show:** `/scoring/<regional-contest-id>`, Category and Division filters.
Save one topical result, such as Part 1 = 60 and Part 2 = 65.

**Say:**

> “Project and Team Contest take one score. Topical entries take two parts,
> and the app totals them. For Knowdown, it records the final places rather
> than running the elimination bracket.
>
> Here I save the two topical scores. The total is 125. The entry shows that
> a result has been entered and records the editor and version.”

**Show:** **Missing only**, a blank result and an explicitly entered zero.

> “This view helps find work still outstanding. A blank means missing; zero
> is an actual score. For bulk entry, there is also a score CSV: download,
> edit, preview, then import. Version checks help prevent an older file from
> silently overwriting a newer edit.”

**Knowdown final outcomes:**

> “Knowdown records each entrant's final outcome as placed or eliminated.
> Places one through four are unique across the contest, so the six-person
> example can be finalized without inventing places for the two eliminated
> students. The app records final outcomes; it does not track each round.”

### 3. Review results and hand them to the state admin

**Show:** The prepared six-person Knowdown field with four places and two
eliminated outcomes, plus valid complete results in the other categories. Use
**Finalize results** on Scoring, then **View regional results**. Show fourth
place labeled **Alt** and the eliminated entrants listed separately.

**Say:**

> “This prepared example shows the review stage. Finalization locks scoring.
> Results are organized by event and division, with actual-grade standings for
> Topical Individual and an ordered Knowdown finish. Ties keep the recorded
> scores; they can produce shared qualifying places.
>
> There is a separate Publish control. Coordinators can review finalized
> results first; coaches receive a Results link only after publication.”

**Show:** **Reopen for correction** reason field without submitting; then switch
to statewide admin and open **Qualifications** to preview the next chapter.

> “Corrections after finalization require reopening with a reason. The state
> admin then reviews qualification decisions and any score-cutoff additions.
> That is the handoff I most want to compare with your current spreadsheets.”

**Close:**

> “At your busiest point on contest day, would entering results this way help?
> What exception from last year's contest should we try to reproduce?”

## Script 3 — What a school coach does

**Account:** Coach-only. **Screens:** My schools, then assigned Registration for an editable
regional contest. Prepare students in grades 9, 9 and 11 for a team example;
keep their other entries valid and the intended category available.

### 1. Get to the school's registration

**Show:** Already signed in as the coach, open **My schools** to show the
assigned school and its invitation status, then open its Registration link.
Do not display sign-in tokens.

**Say:**

> “The coach signs in with an emailed link, can respond to the school's
> invitation here, and manages that school's registration. Students don't need
> accounts. The assigned registration link appears in the menu when the school
> has a participation record for a regional contest.”

### 2. Separate the student list, attendance, and events

**Show:** **Annual students** → **Add annual student** for a fictional student;
then **Contest roster** → **Add to roster**.

**Say:**

> “There are three steps: who is in the school's student list for this season,
> who is coming to this contest, and which events they are entering.
>
> Adding a name here doesn't enter them automatically. I add the student to
> the contest roster, then select their events. I'd like to learn whether this
> separation is clear or whether coaches would want a more direct workflow.”

### 3. Form a valid team

**Show:** **Category entries** → Team Contest → **Create entry** → **Add member**.
Add the first ninth grader at grade 9. Attempt the second at grade 9; show the
validation error. Retry at grade 10, then add the eleventh grader at grade 11.

**Say:**

> “Team entries have up to three students with different competing grades.
> Here's a second ninth grader. Using grade 9 again is rejected. I can enter
> that student at grade 10 instead, and add the eleventh grader at grade 11.
>
> Competing grade belongs to this team entry. A student can play up, but can't
> play below their actual grade. The app also checks duplicate category entries,
> Topical Team versus Individual, and the school's Knowdown limit.”

### 4. Offer the spreadsheet route and explain the deadline

**Show:** **Download registration CSV**, a prepared export, **Preview CSV**, and
the preview result. State explicitly whether an import is performed.

**Say:**

> “For a larger roster, the coach can use the app's CSV template in a
> spreadsheet. Preview checks the file without saving it; Import applies it.
> This is a defined template, so an existing legacy workbook won't import
> directly.
>
> Once registration is locked, the coach needs the coordinator to handle a
> correction. Coaches don't enter regional scores. If the school qualifies for
> state, there is a separate attendance and state-entry workflow. Team berths
> and some replacement cases still need the state admin's help.”

**Close:**

> “Thinking of a coach who only does this once a year, where would they get
> stuck? Would they use these forms, the CSV, or ask someone else to enter it?”

## Optional chapter — From regional results to state participation

**Length:** About 2 minutes. **Account:** Statewide coordinator. Prepare an
unpublished qualification draft separately from any already frozen seed round.

**Show:** Program → **Open qualifications** → choose a finalized regional →
**Generate qualification draft**; focus on the Reasons column.

**Say:**

> “This is where the regional results become a reviewable state invitation
> list. The draft records the qualification reasons, including placement and
> actual-grade results. You review it before publishing and freezing the round.
>
> I'd want to compare this against one of your actual past invitation lists
> to confirm the rules and exceptions match.”

**Show:** Division cutoff fields and **Preview cutoff additions**, using a
prepared example that actually adds an entry. Do not invent a qualifying outcome.

> “You can also preview separate division cutoffs for Team Contest, Topical
> Team, and Topical Individual, and review who would be added. Preview doesn't
> save a decision. Saving a draft and publishing it are separate actions.”

**Show:** Prepared published qualifications, then Program → **Open state
administration**, **Qualified-school attendance**, and a prepared state roster.
The example school must already have state participation recorded.

> “Qualification and attendance are separate. A qualified school records
> whether it is coming, and the state roster records how each student is
> admitted: an individual qualification or a qualified team berth.
>
> The state admin can exercise a team berth and arrange its members. The
> replacement workflow still needs work, especially for a student who wasn't
> already registered this season. State scoring then uses the same scoring
> screens, with a public results page after finalization and publication.”

**Close / concrete next step:**

> “Would you be willing to choose one past regional contest to replay together,
> with a regional coordinator and a coach? We could compare the results and
> state invitations, and identify exactly what would need to change before
> you would trust it for a pilot.”

## Presenter checklist

- Validate the demo environment, actual email sign-in, and every chosen screen
  before recording; this draft has not been browser-rehearsed.
- Use fictional data and separate roles; do not expose real student lists,
  real invitations, credentials, or sign-in links in the recording.
- Prepare valid fixture data rather than relying on the current seed unchanged.
- Keep an editable registration example, a scoring example, and a finalized
  results example. Make cuts between those stages explicit.
- Do not reuse a frozen qualification round for a draft-generation scene.
- Use the scoring page's finalization control. Program no longer offers a
  direct `finalized` transition; publishing is a separate action.
- Explain that Knowdown captures final outcomes but does not track each
  elimination round. Do not present mixed-school Topical Teams as working.
- Do not promise offline use, legacy workbook import, payments, automatic
  annual roster rollover, or automatic coach notifications after qualification.
- In a live discussion, pause after each chapter. Ask for a real task or
  exception; capture the answer before explaining another feature.
