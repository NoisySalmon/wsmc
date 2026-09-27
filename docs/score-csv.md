# Score CSV format

Scoring uses the versioned `wsmc.scores.v2` format. It is a wide,
one-row-per-entry CSV for scorekeepers and coordinators who need a spreadsheet
workflow without losing contest scope or edit concurrency.

Columns, in order:

`format_version,entry_id,category,division,entry_number,school_name,score,part1,part2,placement,knowdown_outcome,version`

`entry_id` and `version` are stable safeguards. The importer rejects a stale
entry ID, category/division/number mismatch, or version that changed after the
export. This prevents an older spreadsheet from silently overwriting a newer
score. Blank numeric cells mean “missing”; `0` is a real score. Topical rows
use `part1` and `part2` (each 0–75) and the total is derived. Other scored
categories use `score`.

Knowdown rows use `knowdown_outcome` to distinguish a blank, unfinished result
from an entrant who was eliminated. Leave the outcome and placement blank for
a missing result. Use `eliminated` with a blank placement for a nonplacing
entrant. Use `placed` with one final placement from 1 through 4. Places must be
unique across the contest. A fourth place is stored as placement `4`; regional
results label it as the state alternate. Do not put Knowdown outcomes or
placements on other categories.

Preview parses and validates the entire file without writing. It checks the
Knowdown outcomes and placement uniqueness across the contest. A successful
import applies all score changes with a D1 batch and records an import row and
audit event; any validation error rejects the file before changes are queued.
