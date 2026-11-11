# State Coordinator Guide

This guide covers the current WSMC application for a state coordinator. In
the interface and access settings, this role may be called a **statewide
coordinator**, **system-wide coordinator**, or **season coordinator**.

Use this guide both as an operating walkthrough and as a functional
verification checklist. Sections marked **Current implementation note**
describe behavior that is important during first-round testing.

## Access levels

There are two state coordinator scopes:

- A **system-wide coordinator** can create seasons, administer users, and work
  in every season.
- A **season coordinator** can administer the seasons assigned to them, but
  cannot create a season or open User administration.

A user may have several assignments at once. For example, a state coordinator
may also be assigned as a regional coordinator or coach.

## Sign in

1. Open `/login` in the deployed WSMC site.
2. Enter the exact email address on your invitation.
3. Open the sign-in link sent by email. The link expires after 20 minutes and
   works only once.
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
| **Users** | Invite users and manage assignments, sessions, and account status. System-wide coordinators only. |

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
There are no per-season policy switches. Topical Individual is allowed; Topical
Teams remain within one school.

## 2. Maintain the school directory

Open **Schools**.

1. Enter the school's name and city. Short name, address, state, ZIP, and
   contact email are optional.
2. Select **Add school**.
3. If the application finds a similar name and city, review the suggestions.
   Select **Create anyway** only when it really is a different school.
4. Use **Mark inactive** to prevent a school from being selected for new work
   while preserving history. Use **Reactivate** to restore it.

The school directory does not store a permanent division. Division is chosen
for each contest participation.

## 3. Invite and administer users

Open **Users & access**. This page is available only to an administrator.

1. Enter the user's email and, for a new account, display name.
2. Choose one assignment:
   - **Administrator** for all seasons and user administration;
   - **Regional coordinator** and a region, across seasons;
   - **School coach** and a school, across seasons;
   - **Scorekeeper** and an individual contest.
3. Select **Add person**. Existing accounts receive access without an email or
   changes to their name or sign-in links; new accounts receive an invitation.

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

For spreadsheet entry, select **Download registration CSV**, edit the complete
file, use **Preview CSV**, and only then use **Import CSV**. Preview does not
save changes; import is all-or-nothing. See `docs/registration-csv.md` for the
column contract.

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

Program does not offer `finalized`. Finalize from the scoring page after the
completeness check, then publish separately. Coaches can see regional results
only after publication.

## 7. Publish state qualifications

Open `/qualifications/[seasonId]` to review qualifications.

### Regional placement round

1. Select a finalized regional contest.
2. Select **Generate qualification draft**.
3. Review every category, school, student/team, active/alternate state, and
   qualification reason.
4. Select **Publish and freeze this round**.

Generation is repeatable while the round is a draft. Publishing freezes the
decisions.

### State score-cutoff round

1. Enter separate Division 1 and Division 2 thresholds for Team Contest,
   Topical Team, and Topical Individual. Leave a field blank for no cutoff.
2. Select **Preview cutoff additions**. This does not save anything.
3. Review proposed additions and entries already qualified by placement.
4. Select **Save cutoff draft**, review the saved count, then select **Publish
   and freeze cutoffs**.

Project and Knowdown do not receive cutoff additions.

### Manual decisions

Enter the stable Entry ID, optional Student ID, a required reason, and Include
or Exclude. Review the draft under **Manual review**, then publish it.

**Current implementation note:** The manual-decision form requires internal
IDs that are not consistently displayed in the browser. Use a downloaded
qualification/result CSV or a database query to obtain them during initial
verification.

## 8. Administer the state contest

From **Home**, select **State contest**.

All attendance and state-entry changes require the state contest to be
`registration_open`.

1. Under **Qualified-school attendance**, record each eligible school's intent
   as Undecided, Attending, or Not attending.
2. For a published team qualification, use **Exercise a qualified team berth**
   to create its state team entry.
3. Under **State roster**, add each student with an explicit admission basis:
   - **Individual qualification** requires that student's qualification;
   - **Team berth** requires the exercised state team entry.
4. Under **State entries**, create school-owned entries or a cross-school Team
   Contest entry, then add confirmed roster members.
5. For team members, choose competing grades that are at least their actual
   grades and distinct within the team.
6. Download the state roster CSV as a review artifact.
7. Use the state contest page to lock rosters, then start scoring.
8. Return to state administration and select **Open state scoring**. Score,
   finalize, review, and publish using the same process as a regional contest.

A blank owner currently creates a mixed-school Team Contest entry.
School-owned entries must use the division recorded on the school's state
participation.

Topical Individual is allowed. Cross-school Topical Teams are not allowed.

## 9. Review and export reports

Open `/reports/season/[seasonId]` for statewide reports. The page
collects finalized contest results and each published qualification round.

Available CSV downloads include:

- school directory from Program;
- participation from Participation;
- contest results from a results or report page;
- qualifications from Qualifications or Statewide reports;
- state roster from State administration.

Published state results at `/state/<state-contest-id>/results` are public and
do not require sign-in.

## Verification checklist

- [ ] A system-wide coordinator sees Program, Schools, Participation, and Users.
- [ ] A season coordinator sees the assigned season but not Users.
- [ ] Similar school names trigger a duplicate suggestion before creation.
- [ ] A contest cannot move backward through its stage controls.
- [ ] Registration edits work only in `registration_open`.
- [ ] Score save buttons work only in `scoring`.
- [ ] Finalization is disabled while any result is missing.
- [ ] Reopening finalized scoring requires a reason and clears publication.
- [ ] Qualification preview does not persist a cutoff round.
- [ ] Published qualification rounds are frozen.
- [ ] A state roster member cannot be added without a valid admission basis.
- [ ] Public state results return not found before publication and load after it.

## Local verification data

The representative seed includes:

- state coordinator: `coordinator@wsmc.example`;
- season: `season-2026`;
- Region 1: `region-1-2026`, contest `contest-region-1` (finalized);
- Region 2: `region-2-2026`, contest `contest-region-2`
  (`registration_open`);
- state contest: `contest-state-2026` (`registration_open`).

The seeded state coordinator is system-wide and has no regional or coach
assignments. Use `regional@wsmc.example` and `regional2@wsmc.example` to
verify distinct regional-only access boundaries.
