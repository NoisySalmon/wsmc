# Coach Guide

This guide covers the current WSMC workflow for a coach assigned to one or
more schools.

Your assignment is for a school across seasons. You may manage only that school's
regional registration and state attendance/entries. Students do not sign in.

## Sign in and find your pages

1. Open `/login` in the WSMC site.
2. Enter the exact email address used for your invitation.
3. Open the emailed one-time sign-in link within 20 minutes. It works only
   once.
4. Select **Sign out** when finished.

For local development, the server terminal prints the link when no production
email provider is configured.

Select **My schools** in the top navigation to see your assigned schools,
invitation responses, and registration links. You can accept or decline a
school's participation while its contest is in setup or registration open.
Keep these direct links for other views (My schools links to registration
for each assigned school):

- regional registration:
  `/registration/<regional-contest-id>/<school-id>`;
- seasonal results and qualifications:
  `/reports/season/<season-id>`;
- state attendance and entries, if the school qualified:
  `/state/<state-contest-id>`.

## 1. Add your team

Open your school's regional registration. The season's regional and state
contest links appear at the top. The student list is shared across the season;
state participation still requires qualification.

Under **Add a student**, enter a full name and actual grade, then select
**+ Add student**. The student is immediately included in the current regional
contest. **Edit student details** lets you correct names and actual grades.
Save pending contest changes before adding or editing students.

## 2. Configure the contest

The **Who’s doing what?** worksheet shows every student in one row:

- **Attendance**: Attending or Not attending. Marking someone Not attending
  removes all their assignments for this contest when saved, while keeping
  their season record and other contest participation.
- **Team Contest**: choose a team and competing grade.
- **Topical**: choose a team or Individual. These choices are mutually exclusive.
- **Project**: optionally choose a project team and competing grade.
- **Knowdown**: nominate up to three attending students.

Select **Save contest** to save attendance and all event assignments together.
If any assignment is invalid, nothing changes in the database. Your draft stays
on screen so you can correct it. Existing students excluded under the previous
workflow appear as Not attending; change their attendance to include them.

## 3. Team and grade rules

Each team has at most three students with distinct competing grades. A student
may compete at their actual grade or above, never below. Team Contest, Topical,
and Project teams are independent. Students may have one assignment in each
category and cannot enter both Topical Team and Topical Individual.

The worksheet refuses replacement of entries that already have scores. Contact
your coordinator for those corrections. Registration is read-only after locking
or archiving the season.

## 4. Use the registration CSV option

1. Download the empty registration CSV template.
2. Enter student name, grade, Team Contest team number, Topical team number,
   and Knowdown choice. Assign Project teams in the worksheet.
3. Preview the upload and review additions, duplicates, and skipped rows.
4. Import accepted rows, then correct any contest-rule warnings in the worksheet.

Imports append students; they do not update existing students or replace event
assignments. Duplicate name/grade rows are skipped. See the
[CSV contract](../registration-csv.md) for exact columns and validation.
Imports require editable, open regional registration.

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
and Knowdown places with fourth place labeled as the state alternate. Entrants
who were eliminated are listed separately. Coaches see a regional result page
only after its coordinator publishes it.

## 7. Prepare state registration

After qualifications are published and state registration opens, follow your
school's state contest link. The worksheet starts from published qualifications
and regional team assignments. Review these defaults before saving.

1. Mark each student attending or not attending and review event choices.
2. Use **Show the full school roster to add substitutes** to select replacement
   students. New students can also be added in the state worksheet.
3. Place substitutes on a qualified school team. Teams have at most three
   members and must meet competing-grade rules. Individual qualifications stay
   with the original student.
4. Review Ad Hoc choices for available team-event slots. Topical Individual
   qualifiers stay on the individual track. Every attendee needs an event,
   Project invitation, or Ad Hoc signup.
5. Save registration to confirm attendance and event choices. Resolve any
   validation messages before continuing.

Use **Withdraw registration** and confirm to mark the whole school not attending.
The saved worksheet is retained for resuming registration. After rosters lock,
contact a state administrator for attendance changes. Ad Hoc signups are formed
into teams by the state administrator.

## 10. View state results

After state scoring is finalized and published, anyone can open
`/state/<state-contest-id>/results` without signing in. The public page includes
only result information: ranks, students or teams, schools, divisions, and
scores.
