# Score CSV format

The scoring export uses the versioned `wsmc.scores.v1` format. It is a wide,
one-row-per-entry CSV intended for scorekeepers and coordinators who need a
spreadsheet workflow without losing contest scope or edit concurrency.

Columns, in order:

`format_version,entry_id,category,division,entry_number,school_name,score,part1,part2,placement,version`

`entry_id` and `version` are stable safeguards. The importer rejects a stale
entry ID, category/division/number mismatch, or version that changed after the
export. This prevents an older spreadsheet from silently overwriting a newer
score. Blank numeric cells mean “missing”; `0` is a real score. Topical rows
use `part1` and `part2` (each 0–75) and the total is derived. Knowdown rows use
`placement` (1–4). Other categories use `score`.

Preview parses and validates the entire file without writing. A successful
import applies all score changes with a D1 batch and records an import row and
audit event; any validation error rejects the file before changes are queued.
