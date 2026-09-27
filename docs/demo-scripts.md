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

**Show:** `/program`, **New season**, then a populated season and its contests.

**Say:**

> “The year is organized as one season, with numbered regions, a contest for
> each region, and a state contest. Schools live in a shared directory, while
> participation and divisions are recorded for the particular contest.
>
> You create the season here. I've already prepared the regions and contests
> so we can look at the whole structure. Creating a regional contest currently
> asks for an internal region identifier; that still needs a normal selection
> control before I'd hand annual setup over to you.”

**Show:** State contest policy fields; use a prepared contest with cross-school
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
> The current version needs the statewide or regional coordinator to record a
> school's acceptance or decline. A coach's navigation shows a registration
> link for each assigned school with a participation record in a regional
> contest. The coach still has no invitation-response dashboard.”

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

**Accounts:** Regional-only coordinator, with an explicit statewide-admin
handoff for lifecycle changes. **Screens:** Registration → Scoring → Results.
Use the assigned contest's Scoring link in the coordinator's navigation.

### 1. Check what the schools are bringing

**Show:** A prepared school registration page from **Participation** →
**Open registration**, including roster and category entries.

**Say:**

> “Each school selects the students attending and enters them in the events:
> Project, Team Contest, Topical Team or Individual, and Knowdown. The team
> entries include the members and their competing grades.
>
> That gives the coordinator the entries that will need scores. The event
> itself still runs in person, with people judging or marking the work.”

**Show:** Switch explicitly to the statewide account and move the prepared
contest through `roster_locked` to `scoring`, or cut to that prepared stage.

> “When registration is ready, the roster is locked and the contest moves to
> scoring. Today the statewide admin has to make those transitions. That
> handoff needs improvement if regional coordinators will run this independently.”

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

**Knowdown caveat — retain in recording:**

> “Knowdown still needs a scoring fix: the completeness check expects a top-four
> place for every entrant, including people who didn't place. I wouldn't use
> this for a full live contest until that's corrected.”

### 3. Review results and hand them to the state admin

**Show:** A clearly labeled prepared small example with valid complete results.
Use **Finalize results** on Scoring, then **View regional results**. If the
example cannot be finalized faithfully, show prepared results without simulating
successful finalization. Never fill in fake Knowdown places to clear the check.

**Say:**

> “This prepared example shows the review stage. Finalization locks scoring.
> Results are organized by event and division, with actual-grade standings for
> Topical Individual and an ordered Knowdown finish. Ties keep the recorded
> scores; they can produce shared qualifying places.
>
> There is a separate Publish control. One current gap is that signed-in
> coaches can already see finalized regional results before publication, so
> this doesn't yet provide a private review period.”

**Show:** **Reopen for correction** reason field without submitting; then switch
to statewide admin and open **Qualifications** to preview the next chapter.

> “Corrections after finalization require reopening with a reason. The state
> admin then reviews qualification decisions and any score-cutoff additions.
> That is the handoff I most want to compare with your current spreadsheets.”

**Close:**

> “At your busiest point on contest day, would entering results this way help?
> What exception from last year's contest should we try to reproduce?”

## Script 3 — What a school coach does

**Account:** Coach-only. **Screen:** Assigned Registration link for an editable
regional contest. Prepare students in grades 9, 9 and 11 for a team example;
keep their other entries valid and the intended category available.

### 1. Get to the school's registration

**Show:** Already signed in as the coach, opening the assigned Registration
link from the navigation. Do not display sign-in tokens.

**Say:**

> “The coach signs in with an emailed link and manages the assigned school's
> registration. Students don't need accounts. The assigned registration link
> appears in the menu when the school has a participation record for a regional
> contest.”

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
- Use the scoring page's finalization control. Program's `finalized` shortcut
  currently bypasses completeness and publishes immediately.
- Do not describe the current regional publishing control as an access embargo,
  Knowdown as contest-ready, or mixed-school Topical Teams as working.
- Do not promise offline use, legacy workbook import, payments, automatic
  annual roster rollover, or automatic coach notifications after qualification.
- In a live discussion, pause after each chapter. Ask for a real task or
  exception; capture the answer before explaining another feature.
