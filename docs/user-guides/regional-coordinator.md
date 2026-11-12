# Regional Coordinator Guide

This guide covers the current WSMC workflow for a coordinator assigned to one
or more regional contests. It is also a verification checklist for the first
implementation.

A regional assignment permits work only in its named contest. It does not
grant statewide setup, school-directory, qualification, state-contest, or user
administration access.

## Sign in

1. Open `/login` in the WSMC site.
2. Enter the exact email address used for your invitation.
3. Open the emailed one-time link within 20 minutes. It can be used only once.
4. Select **Sign out** when finished.

For local development, the server terminal prints the link when no production
email provider is configured.

## What you can manage

| Page | Purpose |
|---|---|
| `/contests/<contest-id>` | Add schools, manage participation, check automatic registration status, and move from registration to roster lock and scoring. |
| `/contests/<contest-id>/staff` | Invite or remove scorekeepers for this contest. Administrators also assign regional coordinators here. Coordinator and coach access applies across seasons; scorekeepers remain event-specific. |
| `/registration/<contest-id>/<school-id>` | Edit any participating school's regional roster and entries. |
| `/scoring/<contest-id>` | Enter scores, finalize, publish, or reopen the assigned contest. |
| `/results/<contest-id>` | Review finalized regional rankings. |

The top navigation includes an **Overview** link for each assigned contest.
**Regions** is reserved for administrators. A **Scoring** link appears after roster lock.

## 1. Prepare school participation

Open your contest **Overview**.

1. Select **Add school** and search by name or city. Choose an existing school
   and select **Add selected school**. Its division comes from the school record.
2. If it is missing from the directory, select **School missing? Create and add**.
   Enter the school name, city, and division. Creation and assignment save together.
   Duplicate name/city matches must be resolved using the existing school.
3. A school assigned to another region cannot be added here. Contact an
   administrator to arrange a transfer.
4. **Remove participation** is available only during setup, with no roster or entries.
5. For a cancellation or no-show, select **Withdraw school**. The saved registration
   remains intact, editing is disabled, and its entries are excluded from scoring,
   result completeness, results, and automatic qualifications. **Restore participation**
   restores the saved registration. Withdrawal is blocked once results exist or the
   contest is finalized. Archived seasons are read-only.

Adding schools requires setup or open registration. If rosters are locked,
reopen registration from a school registration page before adding a walk-in.

Schools do not accept or decline their assignments. Manage coaches through
the contest's **People** page after assigning the school to the contest.

## 2. Review and edit registration

The state coordinator must first place the contest in `registration_open`.
The contest overview automatically shows **No registration**, **Needs attention**,
**Valid**, or **Withdrawn** for each school. Issues include empty entries, students
without event assignments, and rule violations. Optional categories need not be filled.
There is no coordinator verification or approval step. Resolve **Needs attention**
items before locking rosters; schools with no registration do not block locking.

1. From Participation, select **Open registration** for a school.
2. Review the summary: annual students, rostered students, entry count, and
   number of categories used.
3. Add or correct **Annual students** and actual grades.
4. Add participating students to the **Contest roster**.
5. Create explicit category entries, then add rostered students to them.
6. For team categories, choose each member's competing grade.

The application enforces:

- no more than three students per team;
- different competing grades within a team;
- a competing grade cannot be below actual grade;
- one entry per student in a category;
- a student cannot be both Topical Team and Topical Individual;
- no more than three Knowdown students per school;
- only students on this school's contest roster may join an entry.

Entry numbers are optional in the UI, but using positive numbers makes teams
easier to identify in scoring and CSV files.

### Registration CSV

1. Select **Download registration CSV**.
2. Edit the whole file without changing format version or existing stable IDs.
3. Upload it under **Preview CSV**. Preview validates without saving.
4. Correct all row errors.
5. Upload the corrected file under **Import CSV**. The import is atomic and
   safe to repeat.

The complete format is documented in `docs/registration-csv.md`.

Registration CSV download, preview, and import are limited to
`registration_open`, even though the download link remains visible after the
roster locks.

When the contest becomes `roster_locked`, the page is read-only. A regional
coordinator can reopen a roster-locked contest from any school registration
page by entering an audited reason. Reopening applies to the entire contest and
returns it to `registration_open`.

## 3. Enter scores

On the contest overview, select **Lock rosters**, then **Start scoring**.
Open `/scoring/<contest-id>` from the navigation.

1. Check the completeness card. A blank is missing; numeric zero is a real
   score.
2. Use Category, Division, and **Missing only** filters to reduce the list.
3. Enter:
   - one score for Project;
   - one score for Team Contest;
   - Part 1 and Part 2, each from 0 to 75, for topical entries;
   - the final outcome for each Knowdown entrant: **Eliminated**, or
     **Placed** with a unique place from 1 through 4.
4. Select **Save** on each card.
5. Confirm the entry is labeled **Entered** and the editor/version information
   changes.

If another user saved the same result after your page loaded, the application
rejects your stale version instead of overwriting their work. Reload, review
the newer value, and make the correction again if needed.

## 4. Finalize and publish regional results

1. On the scoring page, filter to **Missing only** and resolve all entries.
2. Confirm the completeness card says **Complete**.
3. Select **Finalize results**. This locks scores but does not publish them.
4. Open **View regional results** and review rankings:
   - Project, Team Contest, and Topical Team by division;
   - Topical Individual by division, with overall and actual-grade ranks;
   - Knowdown as one ordered list for the region, with fourth place labeled
     **Alt** and eliminated entrants listed separately.
5. Return to scoring and select **Publish results**.

Rankings use competition ranking, so a tie can produce `1, 2, 2, 4`. Tied
entries at a qualifying rank are supported; do not alter a score merely to
remove a tie.

If a correction is required after finalization, enter a reason and select
**Reopen for correction**. The contest returns to `scoring`, publication is
cleared, and the reopen is audited. Correct the result, finalize again, review,
and republish.

## 5. Handoff to the state coordinator

Tell the state coordinator when regional results are finalized and published.
The state coordinator generates and publishes placement qualifications and
later state score-cutoff additions. Regional coordinators cannot administer
qualification rounds or the state contest.

Provide any operational context the rankings cannot express, especially a
Knowdown alternate or a result correction made after an earlier review.

## Current implementation gaps to verify

- A state coordinator opens registration from Program. The regional
  coordinator can then lock rosters and start scoring from the contest overview.
- Scorekeeper management is limited to the assigned contest; general user
  administration remains system-wide only.
- Overview and stage-valid Scoring links appear in the regional coordinator's
  top navigation; finalized results are linked from Scoring and the overview.
- Knowdown finalization requires an outcome for every registered entrant and
  rejects duplicate places. Missing remains distinct from eliminated.

## Verification checklist

- [ ] Only assigned contests appear on Participation.
- [ ] A regional coordinator can invite an existing school to an assigned contest.
- [ ] Coach assignment is allowed only for a participating school in scope.
- [ ] Registration for an out-of-scope contest or school returns forbidden.
- [ ] Registration edits are blocked outside `registration_open`.
- [ ] Invalid team grades, team size, or Topical combinations are rejected.
- [ ] Score edits are enabled only in `scoring`.
- [ ] A stale browser score edit is rejected.
- [ ] Finalization is blocked until every entry has a result.
- [ ] Finalization, publication, and reasoned reopening succeed in contest scope.
- [ ] Qualification and state administration pages remain forbidden.

## Local verification data

The seed includes `regional@wsmc.example`, assigned to Region 1, and
`regional2@wsmc.example`, assigned to Region 2. Each account is limited to its
own region. The Region 1 coordinator is also assigned as a coach for Alpha
High School. Request a local sign-in link for either email from `/login`.

Region 2 is seeded in `registration_open`. Region 1 is finalized. The seeded
state coordinator has statewide access only, so use the regional accounts to
test regional-only access boundaries.
