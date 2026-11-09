# Persistent role assignments across seasons

Implemented model: access belongs to an account and an organizational scope,
independently of the competition season. Competition data continues to belong
to its original season and contest.

## Assignment model

- Administrator: one assignment per user, without a season.
- Regional coordinator: one assignment per user and stable region number.
  Annual `regions.id` and `contests.id` remain season-specific. Resolve a
  coordinator's permission through the contest's region number.
- Coach: one assignment per user and school. Schools already persist across
  seasons. Contest participation still determines which schools appear in a
  contest, but creating a new season does not create coach assignments.
- Scorekeeper: one assignment per user and individual contest, as today.
  Access does not carry into a new season or another regional/state event.
  Season creation does not copy scorekeeper assignments.

Assignments remain many-to-many. Revoking an administrator, coordinator, or
coach assignment removes access for that scope across seasons. Revoking a
scorekeeper assignment removes access only for its individual contest. Disabling
an account continues to revoke sessions and outstanding sign-in tokens. Principal permissions are loaded from current
assignments on each request, so an already signed-in account observes removal.

## History and archived seasons

Authorization answers who may act now. Historical attribution answers who acted
then. These are independent.

`audit_events.actor_user_id`, `results.last_edited_by`, `imports.created_by`,
`qualification_rounds.created_by`, and `state_attendances.updated_by` refer to
accounts, not role-assignment rows. Preserve those account IDs and all existing
competition and audit rows during migration and reassignment. A successor gets
their own account and assignment; never repurpose the predecessor's account.

For example, when Alice is replaced by Bob as Region 1 coordinator, remove
Alice's Region 1 assignment and add Bob's. Bob can access Region 1 across
seasons. Alice retains any unrelated assignments. Alice's past actions still
identify Alice. Archived competition data remains read-only under the existing
season and contest lifecycle guards.

Record subsequent assignment grants and revocations as audit events containing
the acting administrator/coordinator, target user, role, and organizational
scope. This records the access change without rewriting earlier events.
Current staff lists show current access; they must not be presented as a roster
of the people responsible for an earlier season.

## Pre-launch schema transition

The application is not live. Use a direct schema change and update development
seeds and fixtures to the new assignment model. No legacy assignment conversion,
compatibility layer, retained/retired access report, or staged rollout is needed.
Migration `0006_persistent_access.sql` resets only administrator, coordinator,
and coach assignment tables. Apply it and re-seed development fixtures or use
the administrator bootstrap procedure. Accounts, competition history, audit
records, and event-specific scorekeeper assignments are retained. No existing
workspace database is reset automatically by the implementation.

- Store administrator assignments by user, regional coordinator assignments by
  user and region number, and coach assignments by user and school.
- Keep scorekeeper assignments keyed by user and contest.
- Update schema, authentication, forms, seeds, and fixtures together. Remove
  obsolete season-specific assignment fields and rollover logic.
- Keep historical attribution tied to account IDs. Reassignment changes access
  rows only; it never changes existing audit actors or result editors. A fresh
  development seed does not justify rewriting history in application behavior.

## Application changes

- Replace administrator, coordinator, and coach assignment keys in schema and
  auth services with the persistent scopes above. Keep scorekeeper contest keys.
  Remove the season selector for coaches and use a region selector for coordinators in Users & access.
- Update principal loading and capabilities, home/archive visibility, school
  pages, results/reports, state dashboard scoping, regional staff lists, and QR
  sign-in authorization to use the same persistent assignments.
- Remove coordinator/coach assignment copying from `createSeason`. School
  placements may still copy forward; access needs no rollover step.
- Archived People pages show current coordinator/coach access but cannot grant
  or revoke roles or issue sign-in codes. Use the current season or Users &
  access to manage current permissions. Navigation links target the active
  season; historical contests remain accessible from Home.
- Label staff removal clearly: it revokes persistent access for that region or
  school. Keep the current rule that only administrators assign coordinators.
- For regional coordinator management of coaches, validate school participation
  in the coordinator's contest before granting/removing the global school
  assignment. The UI must explain that this affects every season.

## Verification contracts

- An assigned coordinator/coach can access the same region/school after a new
  season is created without copied assignment rows.
- A scorekeeper can access only their assigned event; a new season does not
  grant access to its corresponding regional or state contest.
- An unrelated region/school remains inaccessible, including forged form IDs.
- Revocation takes effect for an existing session across seasons.
- Replacing a coordinator leaves prior audit actors and result editors intact.
- Archived seasons remain read-only despite persistent access.
- Fresh database setup and development seeds work with the new assignment
  model, preserving pending/disabled account behavior.
- QR issuance retains its existing protection against coordinators generating
  whole-account credentials for accounts with coordinator/admin access.
