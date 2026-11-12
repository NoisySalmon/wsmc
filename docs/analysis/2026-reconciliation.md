# 2026 source reconciliation

Run `python scripts/reconcile-2026-results.py` after extraction and before
seeding or running the private 2026 integration checks. Requires Poppler
(`pdftotext`) and the private statewide PDF in `State Math/2026/`.
The script reads original inputs without modifying them. Both outputs stay in
the gitignored `scripts/data/2026-regionals/` directory:

- `reconciliation.json`: reviewed Knowdown identity links, with workbook hash,
  original name/school, roster IDs, PDF hash, and evidence.
- `reconciliation-report.json`: every entered Knowdown placement and all 134
  rows in the PDF's four team tables, including printed members, scores,
  candidate entries and conflicts. Project and individual reference text is
  retained but those rows still need identity-level reconciliation.

The generator consumes the overlay when present, rejects mismatched workbook
hashes or invalid roster identities, and records each correction in its seed
report and contest audit event. Raw extracted JSON and workbook values remain
unchanged. Regenerate the overlay after changing or re-extracting inputs.
Without the overlay the generator still produces the original replay, but the
private regression checks expect the reviewed reconciliation to be present.

Seven previously unresolved Knowdown placements link through explicit school
aliases or reviewed spelling corrections. Region 5's second place was omitted
because `Jackson` did not match `Henry M Jackson`; the student's name matched
exactly. No fuzzy name matching, grade inference or new student identities are
used. Four unresolved placements remain: Region 3 first, Region 7 second and
alternate, and Virtual third. `Nalin` is ambiguous in the roster, which contains
two possible records; the other missing identities require further evidence.

Of the 134 printed team rows, 116 match both the raw roster and total exactly.
Thirteen require roster/region review. Five Virtual topical teams match their
rosters but lack usable two-part totals. The PDF supplies combined totals;
these are not split into invented parts. Some printed regions are inconsistent:
Klahowya appears under 11 on page 3 and 9 on page 5, while its workbook is
Region 10. Printed place is retained as evidence, not substituted for computed
regional rank. The PDF is a qualifier list; absent entries are not deleted.

The seven corrections were also applied to the existing local qualification-stage
season without reseeding, with per-entry audit records and a SQLite backup at
`/tmp/wsmc-before-reconciliation-f49kcf2z/local.sqlite`. Its existing qualification
drafts were preserved. Use **Save draft** in qualification planning to refresh
those decisions before freezing. Automatic active entries in a fresh replay
increase from 184 to 190; one corrected placement is an inactive alternate.
Earlier population estimates in `2026-qualifications.md` predate this correction
and should not be treated as current reconciled counts.

Validation: the Region 5 storage regression fails without the overlay and
passes with it. `npm run test:2026-results` and `npm run test:qualifications`
pass against isolated migrated databases.
