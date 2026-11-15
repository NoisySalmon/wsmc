# State Coordinator Guide

State coordinators use the **Administrator** assignment, which grants access
across seasons and includes user administration. Regional coordinator and coach
assignments also persist across seasons; scorekeepers are assigned per contest.
See [persistent access](../architecture/persistent-access.md) for details.

## Sign in

1. Open `/login` in the deployed WSMC site.
2. Enter the email address registered with WSMC.
3. Open the sign-in link sent by email. The link expires after 24 hours and
   works only once. Press **Sign in** on the confirmation page.
4. Use **Sign out** in the top navigation when finished.

For local development, the email adapter prints the sign-in link in the server
terminal when production email credentials are not configured. Never save a
raw sign-in link in source control or a test report.

## Main pages

| Navigation | Purpose |
|---|---|
| **Home** | View the current season and contests, advance season stages, archive, and create the next season. |
| **Schools** | Maintain the statewide school directory. |
| **Participation** | Invite schools, assign divisions, invite/assign coaches, and open school registration. |
| **Users & access** | Invite users and manage assignments, sessions, and account status. Administrators only. |

## 1. Set up a season

Open **Home**.

1. Archive the current season before creating another. Only one season can be active.
2. Under **New season**, enter a year and name. Creation automatically includes all
   11 fixed regions, their regional contests, and one state contest.
3. The homepage shows season stages, contest statuses, and dates. Regional contest
   links appear only for users with access to that contest.
   Open a contest to edit its date, manage people, or advance its lifecycle.
4. Once all regional contests are finalized, select **Begin qualifications**.
   Administrators settle who qualifies before selecting **Open state contest**.
   Coaches can then prepare state rosters when state registration is open.
   Regional coordinators have no state contest responsibilities.
5. When the season is finished, select **Archive season permanently**. Archived
   seasons remain available for viewing, are read-only, and cannot be reopened.

The stages are **Regional contests → Qualifications → State contest → Archived**.
There are no per-season policy switches. Topical Individual is allowed; Qualified Topical
Teams remain within one school; ad-hoc teams combine schools.

## 2. Maintain the school directory

Open **Schools**.

1. Enter the school's name and city. Short name, address, state, ZIP, and
   contact email are optional.
2. Select **Add school**.
3. If the application finds a similar name and city, review the suggestions.
   Select **Create anyway** only when it really is a different school.
4. Use **Mark inactive** to prevent a school from being selected for new work
   while preserving history. Use **Reactivate** to restore it.

The school directory stores the default division. Each contest participation
snapshots its division so later directory changes preserve contest history.

## 3. Add and administer users

Open **Users & access**. This page is available only to an administrator.

1. Enter the user's email and, for a new account, display name.
2. Choose one assignment:
   - **Administrator** for all seasons and user administration;
   - **Regional coordinator** and a region, across seasons;
   - **School coach** and a school, across seasons;
   - **Scorekeeper** and an individual contest.
3. Select **Add person**. Access is added without sending email. Existing names
   and sign-in links are preserved.
4. When needed, select **Send sign-in email**. People can also request their
   own link from the sign-in page. Links last 24 hours; the first successful
   sign-in activates a pending account.

Removing persistent access affects every season. Replacing a coordinator never
changes the account attributed to past actions. Grants and removals are audited.

In the user list you can:

- **Revoke links/sessions** to invalidate outstanding links and active sessions;
- **Disable** an account, which also revokes its sessions;
- **Enable** a disabled account;
- **Remove** an individual assignment.

The application prevents you from disabling yourself or removing your own
administrator assignment.

## 4. Invite schools and coaches

Open **Participation**.

1. Under **Invite a school**, select a contest and an active school, assign
   Division 1 or 2, and select **Send invitation**.
2. Under **Invite a coach**, enter an email and name, then select the
   school. This creates or updates the user and sends a sign-in link.
3. To reuse an existing active user, use **Assign an active coach** instead.
4. The **Participations** list shows the contest, division, and invitation
   status. A state coordinator can record **Accept** or **Decline** during the
   current implementation.
5. Select **Open registration** to administer that school's regional roster.
6. Use **Remove** under Coach assignments to remove access that is no longer
   needed.

## 5. Register a regional school

Registration is editable only while the regional contest is
`registration_open`.

1. Open **Participation**, then select **Open registration** for a school.
2. Add each student to **Annual students** with their name and actual grade.
3. Add participating students to the **Contest roster**. Annual students are
   not rostered automatically.
4. Under **Category entries**, create the required Project, Team Contest,
   Topical Team, Topical Individual, and Knowdown entries.
5. Add rostered students to each entry. For a team entry, select a competing
   grade for every member.
6. Review the readiness summary at the top of the page.

The application enforces the same rules in the browser, server actions, and
CSV import: team size of at most three, distinct competing grades within a
team, playing up only, one entry per student per category, Topical Team versus
Topical Individual exclusivity, and no more than three Knowdown students per
school.

For spreadsheet entry, select **Download registration CSV template**, fill in
new students, use **Upload and review**, and then **Confirm import** without
uploading again. Reviewing does not save changes; import appends accepted rows and reports skipped rows. See the
[CSV contract](../registration-csv.md) for details.

## 6. Advance the contest and score it

The intended contest sequence is:

`setup` → `registration_open` → `roster_locked` → `scoring` → `finalized`

Open the contest page and use its stage controls to advance through the first
four states. These controls do not move backward or finalize results.
Regional coordinators manage their own contests; administrators manage state.

For scoring:

1. Open the regional contest and select **Scoring**.
2. Confirm the contest is in `scoring`. Save buttons are disabled otherwise.
3. Filter by category, division, or **Missing only**.
4. Enter one score for Project and Team Contest; enter Part 1 and Part 2 for
   topical entries; record each Knowdown entrant as eliminated or placed 1–4.
5. Confirm the card changes from **Missing** to **Entered** and shows the last
   editor and version.
6. Resolve every missing result. A numeric zero counts as entered; a blank is
   missing.
7. When the completeness summary says **Complete**, select **Finalize results**.
8. Review the locked results, then select **Publish results**.

If finalized results need correction, enter a reason and select **Reopen for
correction**. Reopening returns the contest to `scoring`, clears publication,
and adds an audit event.

Finalize from the scoring page after the
completeness check, then publish separately. Coaches can see regional results
only after publication.

## 7. Publish state qualifications

Open `/qualifications/[seasonId]` to review qualifications.

While regional contests are underway, the provisional list shows automatic
qualifiers from finalized regionals. On Home, begin qualification review once
all regionals are finalized.

1. Review automatic placements and preview score-cutoff additions. Project and
   Topical Individual use a single cutoff each; Team Contest and Topical Team
   use division-specific cutoffs. Knowdown has no score cutoff.
2. For exceptions, choose a named entry under **Manual exceptions**, select
   include or exclude, and record a reason.
3. Save the combined draft after cutoff or exception changes and review it.
4. Select **Publish qualifications and open state contest**. Publication locks
   the list and opens state registration.

## 8. Administer the state contest

Open the state contest to see qualified schools grouped by region. Open a
school's worksheet to review attendance, event choices, and substitutes.
Coaches use the same school worksheet; see the [coach guide](coach.md#7-prepare-state-registration).

You can opt in or opt out all undecided schools. Opt in saves their current
worksheets; already-decided schools are left unchanged. Review Ad Hoc signups
and generate teams from the pools before locking state rosters.

### Score and publish

Start scoring from the state overview. Registration changes must be reflected
in the ad-hoc assignments first. If school imbalance prevents assigning
someone even after regeneration, that student remains listed as unassigned.

**Ad Hoc Team Problem** accepts one score. **Ad Hoc Topical** accepts Part 1
and Part 2, using the same ranges as the corresponding school events. Both are
separate scoring sections; every generated team requires a complete score
before finalization. Numeric zero counts as entered.

Finalize and publish from scoring. Published state results and the state export
include two separate ad-hoc ranking boards across divisions, with member names
and schools. Ad-hoc scores do not enter the school-team ranking boards.

## 9. Review and export reports

Open `/reports/season/[seasonId]` for statewide reports. The page
collects finalized contest results and each published qualification round.

Administrators and statewide coordinators can download three ZIPs of CSV
spreadsheets: **Regionals**, **Qualifications**, and **State contest**. They
remain available during contests and draft review and for archived seasons.
Open **Season exports and reports** from Home. Each includes readable names,
stable IDs, statuses, instructions, and event sheets for offline score entry.
The state export includes the complete season's contest and qualification data.
See [Season exports](../season-exports.md) for contents and offline instructions.

Published state results at `/state/<state-contest-id>/results` are public and
do not require sign-in.
