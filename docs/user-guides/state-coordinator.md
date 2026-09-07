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
| **Program** | Create seasons, regions, and contests; advance lifecycle; open qualifications, reports, scoring, and state administration. |
| **Schools** | Maintain the statewide school directory. |
| **Participation** | Invite schools, assign divisions, invite/assign coaches, and open school registration. |
| **Users** | Invite users and manage assignments, sessions, and account status. System-wide coordinators only. |

## 1. Set up a season

Open **Program**.

1. Under **New season**, enter a year and name, then select **Create season**.
   Only a system-wide coordinator can do this.
2. Under **New region**, select the season, enter the positive region number
   and optional name, then select **Add region**.
3. Under **New contest**, create one regional contest for each region. Choose
   **Regional**, supply the Region ID, name, and optional start date.
4. Create one state contest. Choose **State**, leave Region ID blank, and make
   an explicit Yes/No choice for both state policies:
   - whether every state-rostered student may enter Topical Individual;
   - whether cross-school Topical Teams are allowed.
5. Review the season card. It reports whether every configured region has a
   regional contest, whether a state contest exists, and how many invitations
   are outstanding.
6. Change the season status from `setup` to `active` when appropriate.

Season status values are `setup`, `active`, and `archived`. Archiving is
one-way in the current implementation and makes the season read-only.

**Current implementation note:** The New contest form requires the internal
Region ID, but the Program page does not display region IDs. The seeded Region
IDs are listed under [Local verification data](#local-verification-data). For a
new region, obtain its ID from the database until the UI exposes it.

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

Open **Users**. This page is available only to a system-wide coordinator.

1. Enter the user's email and display name.
2. Choose one assignment:
   - **System-wide coordinator** for all seasons and user administration;
   - **Season coordinator** and a season;
   - **Regional coordinator** and a contest;
   - **School coach**, a season, and a school;
   - **Scorekeeper** and a contest.
3. Select **Send invitation**.

Inviting an existing email adds the selected assignment rather than creating a
duplicate user. Send the form again with another assignment when one person
needs multiple scopes.

In the user list you can:

- **Revoke links/sessions** to invalidate outstanding links and active sessions;
- **Disable** an account, which also revokes its sessions;
- **Enable** a disabled account;
- **Remove** an individual assignment.

The application prevents you from disabling yourself or removing your own
system-wide coordinator assignment.

## 4. Invite schools and coaches

Open **Participation**.

1. Under **Invite a school**, select a contest and an active school, assign
   Division 1 or 2, and select **Send invitation**.
2. Under **Invite a coach**, enter an email and name, then select the season and
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

Open **Program** and use the lifecycle selector to advance through the first
four states. The general selector does not move backward.

For scoring:

1. Open **Program** and select **Open scoring** on the regional contest.
2. Confirm the contest is in `scoring`. Save buttons are disabled otherwise.
3. Filter by category, division, or **Missing only**.
4. Enter one score for Project and Team Contest; enter Part 1 and Part 2 for
   topical entries; enter placement 1–4 for Knowdown.
5. Confirm the card changes from **Missing** to **Entered** and shows the last
   editor and version.
6. Resolve every missing result. A numeric zero counts as entered; a blank is
   missing.
7. When the completeness summary says **Complete**, select **Finalize results**.
8. Review the locked results, then select **Publish results**.

For bulk work, download the score CSV, edit it, preview it, and import it. The
version column prevents an older file from overwriting a newer browser or CSV
edit. See `docs/score-csv.md` for the format.

If finalized results need correction, enter a reason and select **Reopen for
correction**. Reopening returns the contest to `scoring`, clears publication,
and adds an audit event.

**Important:** Do not select `finalized` in the Program lifecycle selector for
normal scoring. In the current implementation that shortcut bypasses the
scoring completeness check and also sets the publication timestamp. Finalize
from the scoring page, then publish separately.

## 7. Publish state qualifications

From the season card on **Program**, select **Open qualifications**.

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

From **Program**, select **Open state administration**.

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
7. Advance the state contest to `roster_locked`, then `scoring` on Program.
8. Return to state administration and select **Open state scoring**. Score,
   finalize, review, and publish using the same process as a regional contest.

A blank owner currently creates a mixed-school Team Contest entry.
School-owned entries must use the division recorded on the school's state
participation.

**Current implementation note:** The state policy for cross-school Topical
Teams is stored and displayed, but the current entry service permits a blank
owner only for Team Contest. A cross-school Topical Team cannot yet be created
through this page even when its policy is enabled.

## 9. Review and export reports

From a season card on **Program**, select **Open statewide reports**. The page
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
- [ ] A contest cannot move backward through the Program lifecycle selector.
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

The seeded state coordinator is both system-wide and assigned to Region 1.
Use a separately invited, regional-only user when verifying regional access
boundaries.
