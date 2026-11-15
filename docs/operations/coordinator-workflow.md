# Coordinator workflow

This is the operator-facing sequence for a statewide coordinator. It uses the
web application; database commands are only for bootstrap and incident
recovery. The local seed is disposable, but the same sequence applies to a
live season after the production email provider and D1 binding are configured.

## 1. Set up a season

1. Sign in as an administrator. Only one season may be active at a time.
2. Open **Home** and create a season after the prior season is archived.
   Enter the year; all 11 fixed regions, regional contests, and the state contest
   are created together. Active schools inherit regional placements from the most
   recent earlier season, with fresh invitations and current school divisions.
   Regional coordinator and coach access persists independently of seasons.
   Review these assignments before registration; scorekeepers need new event
   assignments each season.
3. The homepage shows the season overview, contest statuses, and dates.
   Regional contest links appear only for users with access.
4. Open each contest to set its date and manage people and contest stages.
5. After regional contests are finalized, advance the season to **Qualifications**.
   Administrators settle qualifications, then open the **State contest** stage.
   State roster editing stays closed until that stage and open state registration.
6. Archive the season when finished. Archiving is permanent and read-only.

## 2. Invite schools and coaches

1. Open **Schools** and add or reactivate schools in the directory. Review a
   duplicate suggestion before confirming a new school.
2. Open **Participation**, select a contest, and invite each school with its
   division.
3. Assign one or more coaches to each participating school. Regional
   coordinators can manage schools in contests assigned to them; statewide
   coordinators can manage the full season.
4. Invite a scorekeeper and assign them only to the contest they will score.
5. Have each coach sign in from the emailed link and respond to their school’s
   invitation.

## 3. Complete regional registration

For each school and regional contest:

1. Open the school registration page from the participation workflow.
2. Add annual students with their actual grades.
3. Select contest-roster students explicitly; annual-list membership does not
   enter a student automatically.
4. Create entries for the desired categories and add rostered members. Enter a
   competing grade for each team membership, including playing-up where
   allowed.
5. Use the readiness counts and validation messages to resolve incomplete
   entries, team size, grade, exclusivity, and Knowdown limits.
6. Optionally download the versioned registration CSV, edit it in a
   spreadsheet, preview it, and import it. Preview does not write data, and an
   invalid file is rejected atomically.
7. When registration is complete, open the contest page and move the contest
   to **Roster locked**. Reopening requires a coordinator and an auditable
   reason.

## 4. Run regional scoring

1. Move the contest to **Scoring**.
2. Open its **Scoring** page. Coordinators and assigned scorekeepers can enter
   results; scorekeepers cannot edit rosters or finalize contests.
3. Enter zero explicitly when it is a real score; leave a field blank only when
   the result is missing.
4. Use the category, division, and missing-result filters. The page shows the
   last editor and optimistic-concurrency version for each result.
5. A coordinator finalizes only after the completeness report is clear, then
   publishes results separately. Reopening a finalized contest clears
   publication and requires a reason.

## 5. Publish qualifications

1. Begin qualification review from Home after all regionals are finalized.
2. Review automatic placements and preview cutoff additions. Project and
   Topical Individual use one cutoff each; Team Contest and Topical Team use
   division-specific cutoffs. Knowdown has no cutoff.
3. Select named entries for any manual include/exclude exceptions and record
   reasons. Save the combined draft after changes and review the saved list.
4. Publish qualifications and open state registration. The list is then locked.

## 6. Operate the state contest

1. Open each qualified school's worksheet to review attendance, event choices,
   and substitutes. Coaches can prepare their own school worksheets.
2. Review qualified team membership and competing grades. Substitutes must join
   a qualified team; individual qualifications remain with the student.
3. Review Ad Hoc signup pools and generate teams. Confirm mixed-team divisions.
4. Lock state rosters and advance to Scoring. Finalize complete results and
   publish them separately. Public results are unavailable until publication.

## 7. Reports and recovery

- Use **Reports** for finalized results, published qualification reasons, and
  state-roster exports. CSV exports are versioned and formula-safe.
- Before migrations or contest day, follow the backup and restore procedure in
  [the D1 runbook](d1-runbook.md), then run `npm run test:db` and
  `npm run rehearsal` against an isolated copy.
- For a lost or disabled coordinator, follow [the bootstrap guide](auth-bootstrap.md)
  from a trusted machine. Never copy a sign-in token from logs or tickets.
- After a deployment, run `npm run smoke:preview -- https://<deployed-host>`
  with the real state contest ID and expected publication status.
