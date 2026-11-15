# Season exports

Administrators (including statewide coordinators) can open **Season exports and
reports** from the current or an archived season on Home. Three downloads are
available regardless of season, contest, or publication status:

- **Regionals**: all regional contests, schools and contact details, annual
  students, school participation (including withdrawals), rosters, entries,
  individual/team membership, scores, Knowdown outcomes, and current ranks.
- **Qualifications**: regional data plus all stored qualification rounds,
  publication status, cutoffs, active and inactive decisions, and reasons.
- **State contest**: full season data, including the above, state attendance,
  team berths, state rosters, worksheet absences and event opt-outs, ad-hoc
  signups, mixed-school membership, and state scores/ranks.

Each is a ZIP of UTF-8 CSV files that open in Excel or LibreOffice. Unzip first.
The archive contains instructions and a file/row-count manifest. Human names
accompany stable IDs; dates use UTC ISO 8601. Empty tables retain their headers.
Formula-like text is escaped for spreadsheet safety.

For contest-day continuity, download before the contest. Open a `scoring_*.csv`
file and filter by contest, school, or division. It includes unscored entries
with blank scores. Zero means a recorded zero. Enter scores offline, save the
sheet locally, then transcribe them into the website when connectivity returns.
There is no score re-upload workflow, and these files are not roster imports.
Ranks in an in-progress contest are provisional; they do not recalculate when
you edit the downloaded CSV. Withdrawn entries are retained but unranked.

Exports read their sources in one D1 batch for consistency. They reflect saved
data only: qualification export does not generate or save a draft. Download
again after changes. Contest lifecycle/publication and qualification round
status are included so incomplete snapshots can be recognized later.

User accounts, authorization assignments, authentication credentials, audit
logs, and import logs are excluded. This is a portable contest record, not a
restorable database backup. Downloads contain student information and school
contact details and should be stored appropriately. Responses use `no-store`.

The coach's empty registration CSV template remains available with the roster
upload tool. Upload once, review the counts and skipped-row messages, then
confirm to import. Confirmation revalidates the file against the current roster
and editing permissions.
