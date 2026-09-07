# Coordinator workflow

This is the operator-facing sequence for a statewide coordinator. It uses the
web application; database commands are only for bootstrap and incident
recovery. The local seed is disposable, but the same sequence applies to a
live season after the production email provider and D1 binding are configured.

## 1. Set up a season

1. Sign in with the coordinator invitation.
2. Open **Program** and create the season.
3. Add every numbered region.
4. Create one regional contest for each region, with its date.
5. Create one state contest and choose its Topical Individual and cross-school
   Topical Team policies explicitly.
6. Use the readiness cards to resolve missing regional contests and outstanding
   invitations.

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
7. When registration is complete, return to **Program** and move the contest
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
5. To use a spreadsheet, download the score CSV, edit it, preview it, and
   import it only after the preview is clean. Stale versions are rejected.
6. A coordinator finalizes only after the completeness report is clear, then
   publishes results separately. Reopening a finalized contest clears
   publication and requires a reason.

## 5. Publish qualifications

1. Open **Qualifications** for the season.
2. Generate the regional placement draft after regional contests are finalized.
3. Review placement, actual-grade, Knowdown alternate, and duplicate-reason
   records. Publish only after the reasons are correct; publication freezes the
   round.
4. Preview or save division-specific state cutoffs for Team Contest, Topical
   Team, and Topical Individual. Review proposed additions and existing
   placement qualifiers before publishing the cutoff round.
5. Record any manual include/exclude decisions with a reason, then publish the
   manual review if needed.

## 6. Operate the state contest

1. Invite participating state schools and confirm attendance in **State
   administration**.
2. For each school, add qualified individual students and exercised team-berth
   members to the state roster with an explicit admission basis.
3. A statewide coordinator can exercise qualified team berths, replace or add
   same-school members, and create cross-school Team Contests. Mixed-school
   entries require explicit division confirmation; cross-school Topical Teams
   follow the state policy.
4. Add state category entries and members only after they are on the confirmed
   state roster. Each student can occur at most once per state category.
5. Lock the state roster, move the state contest to **Scoring**, and use the
   shared scoring workflow. State scoring does not create new qualifications.
6. Finalize and publish state results. The public state leaderboard is
   unavailable until publication and exposes result fields only.

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
