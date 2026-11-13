# Local State 2026 state-registration snapshot

Restore with `npm run seed:state-registration` from the project root, then refresh the app.
This replaces the entire local Wrangler database with the captured state:
State 2026 registration open, with the rosters, attendance, qualifications,
regional results, and other local data preserved as captured.

The snapshot lives at `.local/snapshots/state-2026-state-registration.sqlite`.
It contains private local data and is intentionally ignored by Git; it must be
copied separately to use this command in another checkout or on another machine.
The restore command only accesses the local database and saves a timestamped
backup of its previous contents beside the snapshot before replacing it.

The database before reopening registration is also preserved at
`.local/snapshots/before-state-registration-reset.sqlite`.
