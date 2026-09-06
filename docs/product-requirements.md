# WSMC Contest Administration — Product Requirements

**Status:** Draft for implementation  
**Last updated:** 2026-09-06  
**Replaces for planning purposes:** `SPEC.md`, `requirements.md`, and `PROGRESS.md`

The older documents describe the current regional-scoring prototype. They remain useful as implementation history, but this document is the product source of truth for the statewide system.

## 1. Product goal

Build a web application that administers Washington's annual statewide high-school math contest program from regional invitation through state results.

The system must support:

- One annual season.
- One contest in each participating region.
- One state contest after all regional contests.
- School and coach invitations.
- Mobile-friendly roster and entry management.
- Regional and state score entry.
- Regional placement qualifiers followed by statewide score-cutoff qualifiers.
- State attendance, substitutions, and ad-hoc teams.
- Leaderboards, qualification reports, and CSV interoperability.
- Passwordless users with multiple scoped responsibilities.

## 2. Scope principles

- Schools and users persist across seasons.
- Students do not persist across seasons. Coaches enter a fresh roster each year.
- Historical seasons remain readable, but the product does not need cross-year student reporting, student roll-forward, or transfer tracking.
- Participation in each contest category is explicit. A rostered student is not automatically entered in any category.
- Actual grade is annual student data. Competing grade is selected separately for each team entry and may differ between categories.
- The application uses a small number of explicit contest policies. It must not become a general-purpose competition rules engine.
- Reliable internet is assumed. Offline synchronization is out of scope.

## 3. Terminology

- **Season:** One annual regional-to-state cycle.
- **Region:** A numbered geographic/administrative area.
- **Contest:** Either the single regional contest for a region in a season or the single state contest for that season.
- **School participation:** A school's invitation, response, division, and contest-specific administration record.
- **Annual student:** A student entered for a school in one season. Students never have user accounts.
- **Contest roster:** The annual students a school declares for a particular regional or state contest.
- **Entry:** An individual or team participating in one contest category.
- **Qualification:** A frozen state-eligibility decision with one or more recorded reasons.
- **Qualified team berth:** A school's right to submit one state team in the category where its regional team qualified.
- **State roster:** The students a qualified school says will actually attend state.

## 4. Contest categories and entries

Regional and state contests have the same categories:

| Category | Entry kind | Score/result |
|---|---|---|
| Project | Team | One combined numeric score |
| Team Contest | Team | One numeric score |
| Topical Team | Team | Part 1 and Part 2, each 0–75; total is their sum |
| Topical Individual | Individual | Part 1 and Part 2, each 0–75; total is their sum |
| Knowdown | Individual | Ordered finish rather than a numeric score |

“Team Contest” is the canonical product term. Existing “Team Problem” labels should be removed.

### 4.1 Team rules

- Project, Team Contest, and Topical Team entries have one to three members.
- Members of an ordinary school team belong to the same school.
- Every team member declares a competing grade for that entry.
- Competing grade must be the student's actual grade or higher.
- Members of the same team must have distinct competing grades.
- A student's teammates and competing grade may differ among Project, Team Contest, and Topical Team.
- A student may be in at most one entry in a given category at a contest.

### 4.2 Individual and cross-category rules

- A student may participate in multiple categories at the same contest.
- A student may participate in either Topical Team or Topical Individual at a contest, never both.
- No other cross-category restriction is required.
- A regional school may designate at most three Knowdown competitors.

## 5. Organizations and annual setup

### 5.1 Statewide school directory

The application maintains a lightweight directory of schools. Administrators can create a school while issuing an invitation. Duplicate-name/location suggestions should reduce accidental duplicates without creating a restrictive approval workflow.

Directory data includes at least:

- Full name and optional short name.
- Location/address fields needed to identify the school.
- General contact information where useful.
- Active/inactive status.

Division is annual contest-participation data rather than an immutable directory property.

### 5.2 Season and contests

The statewide coordinator creates a season, its participating numbered regions, one regional contest per region, and one state contest. Each contest has its own date and lifecycle.

School participation is invitation-only. A new school contacts an administrator outside the application; the administrator adds and invites it.

## 6. Users, assignments, and authentication

A user can hold multiple assignments simultaneously. Authorization must be capability-based from assignments, not a single role column.

| Assignment | Scope | Capabilities |
|---|---|---|
| Statewide coordinator | System/season | Manage seasons, contests, schools, users, all data, qualification rules, state attendance, publication, and reopening |
| Regional coordinator | One or more regional contests | Invite schools/coaches, manage participating schools, edit any regional roster/entry, manage scorekeepers, score, finalize, publish regional results, and reopen their contest |
| Coach | One or more schools | Respond to invitations, manage assigned-school rosters and entries, view finalized regional results and published qualifications, and manage their school's state attendance |
| Scorekeeper | One contest | View that contest's roster and enter/correct scores while scoring is open |

Supporting multiple coaches per school and exceptional multi-school coach assignments is required. A regional coordinator may also be a coach.

Regional roster visibility/edit restrictions between coordinators are not a product priority. Statewide coordinators can administer everything.

### 6.1 Passwordless access

- Coordinators invite users by email and attach the intended assignments.
- Sign-in uses time-limited, single-use email links.
- Invitations can be resent or revoked.
- Inviting an existing email adds or updates assignments rather than creating a duplicate user.
- User administration shows pending, active, and disabled users.
- Sessions should be long-lived enough for convenient mobile use and support explicit sign-out and administrator revocation.
- Students do not sign in.

## 7. Contest lifecycle and locking

Each regional and state contest uses this lifecycle:

1. **Setup** — coordinators configure the contest and invite schools/staff.
2. **Registration open** — coaches and coordinators edit rosters and entries.
3. **Roster locked** — roster and entry edits stop; contest-day preparation can proceed.
4. **Scoring** — coordinators and scorekeepers enter results; rosters remain locked.
5. **Finalized** — scores and results are locked.

Publication is separate from lifecycle state. This allows coordinators to finalize and verify data before exposing results or qualifications.

The responsible coordinator can reopen a contest or an individual school for corrections. A reopen requires a reason and produces an audit entry. Finalized scores must never become silently editable.

## 8. Regional workflow

### 8.1 Invitation and registration

1. A regional coordinator selects or creates a school from the directory.
2. The coordinator assigns the school's division for the season/contest.
3. The coordinator invites one or more coaches, or administers an uncoached school directly.
4. A coach accepts or declines the school invitation.
5. During Registration open, the coach or coordinator enters the annual students, regional roster, and explicit category entries.
6. The application continuously reports invalid or incomplete entries.
7. The coordinator locks the roster before scoring.

### 8.2 Score entry

- Score entry is optimized for rapid keyboard use on desktop or tablet.
- Coordinators and contest-scoped scorekeepers can work concurrently.
- Missing scores and numeric zero are distinct.
- All browser constraints are repeated server-side.
- Score changes record the acting user and timestamp.
- Concurrent edits must not silently overwrite a newer score; the UI must surface a stale edit or use row-level updates that avoid whole-table replacement.
- Before finalization, the coordinator receives a completeness report for missing or invalid results.

### 8.3 Regional leaderboards

- Project, Team Contest, and Topical Team are ranked separately by division.
- Topical Individual has a separate leaderboard per division, including overall and actual-grade placement.
- Knowdown is a single ordered result, not divided by school division.
- Rankings use competition ranking, such as `1, 2, 2, 4`.
- Every entry tied at a qualifying rank qualifies.
- Ties do not change recorded scores. Coaches may try to resolve Team Contest ties operationally, but the application must support remaining ties correctly.

## 9. State qualification

Qualification occurs in two stages. A qualification is a stored, publishable decision, not a live query whose result can silently change.

### 9.1 Automatic regional placement qualifiers

After a regional contest is finalized:

- First, second, and third place Project teams in each division qualify.
- First, second, and third place Team Contest teams in each division qualify.
- First, second, and third place Topical Teams in each division qualify.
- First, second, and third place Topical Individuals overall in each division qualify.
- First, second, and third place Topical Individuals within each actual grade in each division qualify.
- First, second, and third place Knowdown students qualify.
- Fourth-place Knowdown is recorded as an inactive alternate.
- All entries tied at a qualifying placement qualify.

A student can qualify through multiple overall/grade/category achievements. The system presents one state-eligible student while preserving every qualification reason.

Automatic regional qualifiers can be published before statewide score cutoffs are chosen.

### 9.2 Statewide minimum-score additions

After enough regional results are finalized, the statewide coordinator can set minimum qualifying scores independently by division for:

- Team Contest.
- Topical Team.
- Topical Individual.

The application combines finalized results from all regions and previews the proposed additions, affected schools, and resulting population counts as thresholds change. Project and Knowdown do not receive score-cutoff additions.

Placement qualifiers remain qualified regardless of whether they meet a later score cutoff. The statewide coordinator may manually include or exclude an entry with a recorded reason.

Publishing a cutoff round freezes its qualification additions. Later score corrections produce an impact warning and review queue; they do not silently add or remove published qualifications.

### 9.3 Knowdown alternate

Fourth place does not automatically make the state roster. A coordinator explicitly promotes the alternate if a higher finisher will not attend. The promotion and reason are audited.

### 9.4 School qualification

A school is eligible for state when at least one of its individual entries or team entries has an active qualification. School eligibility is derived from qualifications rather than separately awarded.

## 10. State attendance and entries

### 10.1 School attendance

1. A qualified school's coach records one school-level intent to attend.
2. The coach builds the actual state roster; unused qualifications are not individually declined.
3. Every state-rostered student must be supported by either:
   - Their own individual qualification, or
   - Membership in a state team submitted against one of the school's qualified team berths.
4. A student may be added for state even if they were not on the regional roster when serving on a qualified team berth.

Qualification records remain unchanged when a school chooses not to exercise them.

### 10.2 Qualified team berths and substitutions

- A regional team qualification gives its school one state team berth in that category.
- The state team is a new entry linked to the regional qualification.
- The coach may replace members or fill unused positions, up to three members.
- Replacement members must belong to the same school for a school-owned qualified berth.
- The resulting state team must satisfy competing-grade and size rules.
- V1 does not enforce that any original regional team member remain on the state team.
- The application preserves both the original regional team and final state team for history and reporting.

Individual qualifications are non-transferable.

### 10.3 State entries and ad-hoc teams

- Participation at state remains explicit by category.
- State-rostered students may join cross-school ad-hoc teams for Team Contest.
- The statewide coordinator forms and edits cross-school teams from the confirmed state roster.
- Each state student may appear in at most one entry per category.
- An entry has an explicit division. Ordinary school entries inherit the school's annual division; the statewide coordinator assigns/confirm the division of mixed-school entries.
- The state contest has two simple setup policies:
  - Whether all state-rostered students may enter Topical Individual.
  - Whether cross-school Topical Teams are allowed.
- The statewide coordinator must choose these policies during state setup; the system must not infer them.

State scoring and ranking otherwise use the same category rules as regionals. State results do not generate another qualification stage.

## 11. Visibility and publication

- Signed-in coaches can view finalized, published regional results across all regions.
- Signed-in coaches can view all published qualification lists and state attendance information intended for coaches.
- Draft rosters, school contact details, user administration, score-entry screens, and unpublished results remain authenticated and capability-gated.
- Published state leaderboards are publicly viewable without signing in.
- Public pages show only contest-result information needed for the leaderboard, such as student/team names, schools, divisions, and scores.

## 12. CSV import and export

The application supports documented, downloadable CSV templates. It does not import the legacy scoring workbook.

Required workflows:

- School roster and regional-entry CSV export/import for coaches and coordinators.
- Prefilled score-entry CSV export/import for coordinators and scorekeepers.
- CSV exports for the school directory, contest participation, results, qualifiers, and state rosters.

Import requirements:

- Every template includes a format/version identifier.
- Existing records use stable IDs so round trips do not rely on names alone.
- Upload produces a preview showing additions, changes, warnings, and row-level errors.
- No database changes occur during preview.
- Commit is all-or-nothing when errors remain.
- Imports are idempotent when the same completed template is submitted twice.
- Imports respect lifecycle locks and user permissions.
- Imported changes are audited like UI changes.
- CSV exports must defend spreadsheet users from formula injection in text fields.

Leaderboards and qualifier reports are web pages with CSV download rather than generated Excel workbooks.

## 13. Audit history

The product needs a basic, append-only administrative history, not a full event-sourcing system. Audit at least:

- Contest lifecycle changes, reopening, and publication.
- User invitations, assignment changes, disabling, and session revocation.
- School invitations and responses.
- Score creation/correction/import.
- Qualification cutoffs, manual additions/exclusions, publication, and Knowdown alternate promotion.
- State roster changes and team substitutions.

Each audit record includes actor, timestamp, action, affected object, and a concise before/after summary or reason where appropriate.

## 14. User experience requirements

### 14.1 Coach experience

- Mobile-first layouts and touch targets.
- Fast student entry with minimal repeated typing.
- Clear per-category participation and team membership.
- Immediate, actionable validation messages.
- A single school dashboard showing invitation state, roster readiness, contest lifecycle, qualifications, and state-attendance progress.
- Mobile-friendly passwordless sign-in that works when the email link is opened on the phone.

### 14.2 Coordinator and scorekeeper experience

- Desktop/tablet bulk tables with keyboard navigation.
- Readiness and completeness summaries rather than hunting through school pages.
- Filters by contest, region, division, school, category, and missing-score state.
- Clear indication of who last changed a score.
- Qualification threshold previews with counts before publication.

### 14.3 Accessibility and reliability

- Meet WCAG 2.2 AA for primary workflows.
- Do not communicate validation, lifecycle, or award status by color alone.
- Preserve entered form values after validation failures.
- Provide clear error recovery for expired sign-in links, stale edits, failed email delivery, and rejected imports.

## 15. Out of scope for the first usable release

- Legacy workbook import.
- Offline use or synchronization.
- Student accounts.
- Self-service school registration.
- Cross-year student identity, roster roll-forward, transfer tracking, or longitudinal reports.
- Payments and fees.
- Knowdown bracket/elimination tracking beyond final placement and alternate promotion.
- Automated construction of mixed-school teams or multi-school coach approval workflows.
- A general-purpose configurable scoring/rules engine.
- Public regional leaderboards.
- Name badges and specialized print artifacts.

## 16. Product decisions intentionally left configurable

These are contest setup choices, not implementation blockers:

- Whether every state-rostered student may enter Topical Individual.
- Whether state Topical Teams may contain students from multiple schools.
- Division assigned to each mixed-school state entry.

The transactional email provider and exact sign-in/session durations are implementation choices, provided the behavior in Section 6 is met.

