# Coach Guide

This guide covers the current WSMC workflow for a coach assigned to one or
more schools. It doubles as a functional verification checklist for the first
implementation.

Your assignment is for a school and season. You may manage only that school's
regional registration and state attendance/entries. Students do not sign in.

## Sign in and find your pages

1. Open `/login` in the WSMC site.
2. Enter the exact email address used for your invitation.
3. Open the emailed one-time sign-in link within 20 minutes. It works only
   once.
4. Select **Sign out** when finished.

For local development, the server terminal prints the link when no production
email provider is configured.

**Current implementation note:** The signed-in coach home page does not yet
list school assignments or workflow links, and coaches cannot currently open
Participation to respond to invitations. Ask your coordinator for these exact
links:

- regional registration:
  `/registration/<regional-contest-id>/<school-id>`;
- seasonal results and qualifications:
  `/reports/season/<season-id>`;
- state attendance and entries, if the school qualified:
  `/state/<state-contest-id>`.

During initial testing, a state coordinator must record Accept or Decline for
the school on Participation.

## 1. Build the annual student list

Open the regional registration link. Editing is available only while the
contest heading says `registration_open`.

Under **Annual students**:

1. Enter a student's full name and actual grade, 9 through 12.
2. Select **Add annual student**.
3. Use **Save student** to correct a name or actual grade.
4. Use **Delete** only when the student should be removed from the annual list.

The annual list belongs to your school for the whole season. Adding a student
does not automatically put them on the regional contest roster or in an event.
Deletion may be rejected when the student is already referenced by contest
records; remove those memberships first.

## 2. Choose the regional contest roster

Under **Contest roster**, select **Add to roster** for every student attending
this regional contest.

Use **Remove from roster** to remove someone. A student who is still in a
category entry cannot be removed until you remove those entry memberships.

The readiness summary distinguishes:

- annual students known for the season;
- students explicitly rostered for this contest;
- category entries;
- how many of the five categories are in use.

## 3. Create category entries

Students are not entered in an event automatically.

1. Under **Category entries**, choose Project, Team Contest, Topical Team,
   Topical Individual, or Knowdown.
2. Enter a positive entry number when your school has multiple entries.
3. Select **Create entry**.
4. On the new entry card, select a rostered student.
5. For Project, Team Contest, or Topical Team, select the student's competing
   grade and then **Add member**.
6. For Topical Individual and Knowdown, add one student per individual entry.

Competing grade belongs to this particular team membership. A student may play
at their actual grade or play up, but never down.

The application rejects:

- a fourth member on a team;
- duplicate competing grades on one team;
- a competing grade below the student's actual grade;
- more than one entry in the same category for a student;
- placing the same student in Topical Team and Topical Individual;
- more than three Knowdown students for one school;
- adding a student who is not on this contest roster.

Use the **×** button to remove a member and **Delete entry** to remove an entire
entry. These actions do not show a separate confirmation dialog in the current
UI, so check the entry before selecting them.

## 4. Use the registration CSV option

The CSV workflow is useful for a larger roster.

1. Select **Download registration CSV**.
2. Keep the `format_version`, existing student IDs, and existing entry IDs
   unchanged.
3. Add a new student by leaving `student_id` blank and supplying name and
   actual grade.
4. Use `yes` or `no` for rostered and Knowdown fields. Use the same positive
   category entry number on multiple rows to form a team.
5. Upload the file under **Preview CSV**. Nothing is saved during preview.
6. Correct all reported row errors.
7. Upload the corrected complete file under **Import CSV**. The file is applied
   all-or-nothing and is safe to import again.

Omitting an annual student from the CSV does not delete that student. For
students included in the file, roster and category memberships are made to
match the file. The exact columns are documented in
`docs/registration-csv.md`.

CSV download, preview, and import are also limited to `registration_open`,
even though the download link remains visible on a read-only registration
page.

## 5. Registration locking and corrections

When the contest changes to `roster_locked`, `scoring`, or `finalized`, the
page shows a read-only notice and its edit buttons are disabled.

If you find a problem after locking, contact the regional coordinator. A
coordinator can reopen a roster-locked contest with an audited reason. Coaches
cannot reopen it themselves.

Coaches do not enter regional scores.

## 6. Review regional results and qualifications

Open `/reports/season/<season-id>` using the link supplied by your coordinator.
The page contains:

- links to finalized regional results and their CSV downloads;
- published regional placement qualifications;
- published state cutoff qualifications;
- published manual qualification decisions;
- a qualification CSV download.

Regional result pages show Project, Team Contest, and Topical Team rankings by
division; Topical Individual overall and actual-grade rankings by division;
and the ordered Knowdown finish.

**Current implementation note:** A finalized regional result page is currently
available to any coach assigned in that season even when its publication flag
has not been set. Treat unpublished data as provisional during verification.

## 7. Record state attendance

Your state page becomes available when both of these are true:

- your school has an active qualification in a published round;
- your coach assignment is for the same season.

Saving attendance additionally requires your school to have a participation
record for the state contest. If the page opens but Save attendance reports
that the school is not participating, contact the state coordinator.

Open `/state/<state-contest-id>`. The page is scoped to your assigned qualified
school; it does not expose other schools' rosters or draft entries.

Under **Qualified-school attendance**:

1. Choose Undecided, Attending, or Not attending.
2. Select **Save attendance**.

Attendance and entry changes work only while the state contest is
`registration_open`.

## 8. Build the state roster

Every state-rostered student needs an admission basis.

### Individual qualification

1. Choose your school and student.
2. Select **Individual qualification**.
3. Select that student's published qualification.
4. Select **Add to state roster**.

Individual qualifications cannot be transferred to another student.

### Qualified team berth

The state coordinator must first exercise the qualified berth to create a new
state team entry. The final state team may use replacements or fill unused
positions, up to three students, but school-owned berths use students from the
same school.

1. Choose the student.
2. Select **Team berth**.
3. Select the exercised state entry.
4. Select **Add to state roster**.

**Current implementation note:** The coach-scoped page currently hides berth
records and cross-school state entries. A state coordinator must exercise the
berth and may need to add team-berth roster members during initial testing.
Also, a replacement who is not already in the season's annual student list
cannot be created from the state page; a coordinator must arrange that annual
student record through an editable regional registration or the database.

Use **Download state roster CSV** to review the resulting roster. This is an
export only; there is no state-roster CSV import in the current UI.

## 9. Create state entries

Under **State entries**:

1. Choose a category.
2. Choose your school as owner.
3. Select the same division as your state participation.
4. Enter an optional positive entry number and select **Create state entry**.
5. Add students who are already on the confirmed state roster.
6. For a team, choose a valid competing grade for every member.

A coach cannot create a cross-school entry. The state coordinator manages
cross-school Team Contest entries and any allowed cross-school Topical Teams.
All entries are locked when the state contest leaves `registration_open`.

## 10. View state results

After state scoring is finalized and published, anyone can open
`/state/<state-contest-id>/results` without signing in. The public page includes
only result information: ranks, students or teams, schools, divisions, and
scores.

## Verification checklist

- [ ] The coach can sign in but sees no coordinator navigation.
- [ ] Direct registration access works only for an assigned school and season.
- [ ] An out-of-scope school's registration returns forbidden.
- [ ] Annual students remain separate from the contest roster.
- [ ] Roster membership remains separate from category entries.
- [ ] Team size, grade, duplicate-category, Topical, and Knowdown rules reject invalid changes.
- [ ] CSV preview saves nothing and import rejects the whole file when errors remain.
- [ ] Registration becomes read-only after the lifecycle advances.
- [ ] The coach cannot open scoring, Program, Schools, Users, or Qualifications administration.
- [ ] Seasonal reports show published qualification rounds.
- [ ] State administration is unavailable to a school without an active published qualification.
- [ ] State data is limited to the assigned qualified school.
- [ ] State roster admission basis and entry membership rules are enforced.

## Local verification data

The seed includes these coach accounts:

- `coach1@alpha.example` and `coach2@alpha.example` for Alpha High School;
- `coach@beta.example` for Beta High School.

Useful seeded URLs are:

- Alpha regional registration (finalized and therefore read-only):
  `/registration/contest-region-1/school-alpha`;
- 2026 statewide reports: `/reports/season/season-2026`;
- Alpha state administration (qualified, state registration open):
  `/state/contest-state-2026`.

To verify editable regional registration, a state coordinator can invite Alpha
High School to the seeded `contest-region-2`, record the participation as
accepted, and then give the Alpha coach this URL:
`/registration/contest-region-2/school-alpha`.
