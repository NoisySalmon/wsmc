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
| `/participation` | Invite existing schools, invite or assign coaches, and open a school's registration. |
| `/registration/<contest-id>/<school-id>` | Edit any participating school's regional roster and entries. |
| `/scoring/<contest-id>` | Enter scores, finalize, publish, or reopen the assigned contest. |
| `/results/<contest-id>` | Review finalized regional rankings. |

Only **Participation** appears in the current top navigation. Keep the exact
scoring link supplied by the state coordinator, or copy the contest ID from a
registration URL.

## 1. Prepare school participation

Open **Participation**.

1. Under **Invite a school**, select your assigned contest and an existing
   active school.
2. Choose Division 1 or Division 2 for this participation.
3. Select **Send invitation**.
4. Under **Invite a coach**, enter the coach's email and name, then select the
   matching season and school.
5. If the coach is already an active user, use **Assign an active coach**.
6. Confirm the participation and coach assignment appear in their lists.

You can invite or assign a coach only after that school participates in a
contest you manage. Inviting an existing email adds the coach assignment to
the existing account.

Select **Open registration** beside a participation to administer an uncoached
school or help a coach.

**Current implementation notes:**

- Regional coordinators cannot create or reactivate schools. Ask a state
  coordinator to maintain the School directory.
- The page displays Accept and Decline buttons, but a regional-only account is
  not currently authorized to submit them. A state coordinator must record the
  response during initial testing.
- The visible participation CSV link currently rejects a regional-only
  account. Registration and score CSV downloads do work within contest scope.

## 2. Review and edit registration

The state coordinator must first place the contest in `registration_open`.

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

Ask the state coordinator to advance the contest to `scoring`, then open
`/scoring/<contest-id>`.

1. Check the completeness card. A blank is missing; numeric zero is a real
   score.
2. Use Category, Division, and **Missing only** filters to reduce the list.
3. Enter:
   - one score for Project;
   - one score for Team Contest;
   - Part 1 and Part 2, each from 0 to 75, for topical entries;
   - a placement from 1 through 4 for Knowdown.
4. Select **Save** on each card.
5. Confirm the entry is labeled **Entered** and the editor/version information
   changes.

If another user saved the same result after your page loaded, the application
rejects your stale version instead of overwriting their work. Reload, review
the newer value, and make the correction again if needed.

### Score CSV

1. Select **Download score CSV**.
2. Edit only the appropriate score, part, or placement fields.
3. Use **Preview CSV** and resolve every error.
4. Use **Import CSV**. Any invalid or stale row rejects the complete import.

See `docs/score-csv.md` for the exact columns.

## 4. Finalize and publish regional results

1. On the scoring page, filter to **Missing only** and resolve all entries.
2. Confirm the completeness card says **Complete**.
3. Select **Finalize results**. This locks scores but does not publish them.
4. Open **View regional results** and review rankings:
   - Project, Team Contest, and Topical Team by division;
   - Topical Individual by division, with overall and actual-grade ranks;
   - Knowdown as one statewide-style ordered list for the region.
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

- A regional-only account has no lifecycle control for moving a contest from
  setup to registration, roster locked, or scoring. A state coordinator must
  perform those transitions on Program.
- A regional-only account cannot administer scorekeeper assignments; User
  administration is system-wide only.
- Scoring and results are not linked from the regional coordinator's top
  navigation or Participation page, so direct URLs are currently required.
- Invitation response buttons and participation CSV appear on Participation
  but fail authorization for a regional-only account.
- Knowdown accepts only placements 1 through 4, but the current score service
  does not reject duplicate placements across different students.

## Verification checklist

- [ ] Only assigned contests appear on Participation.
- [ ] A regional coordinator can invite an existing school to an assigned contest.
- [ ] Coach assignment is allowed only for a participating school in scope.
- [ ] Registration for an out-of-scope contest or school returns forbidden.
- [ ] Registration edits are blocked outside `registration_open`.
- [ ] Invalid team grades, team size, or Topical combinations are rejected.
- [ ] Score edits are enabled only in `scoring`.
- [ ] A stale browser or CSV score edit is rejected.
- [ ] Finalization is blocked until every entry has a result.
- [ ] Finalization, publication, and reasoned reopening succeed in contest scope.
- [ ] Qualification and state administration pages remain forbidden.

## Local verification data

The seed does not include a regional-only user. To test this role without
system-wide access masking permission problems:

1. Sign in as `coordinator@wsmc.example`.
2. On Users, invite a new email as Regional coordinator for
   `contest-region-2`.
3. Sign out and use the new invitation.

Region 2 is seeded in `registration_open`. Region 1 is finalized. The seeded
state coordinator is also assigned to Region 1, but is not a valid substitute
for testing regional-only access boundaries.
