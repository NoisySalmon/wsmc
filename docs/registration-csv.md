# School registration CSV

Download registration CSV template provides an empty, five-column CSV:

```csv
Student name,Grade,Team contest team,Topical team,Knowdown
```

Enter one student per row. Grade must be 9, 10, 11, or 12. Team columns accept
positive whole team numbers: students with the same number join the same team
in that event, including existing teams. Blank Team Contest means no event;
blank Topical means individual. Knowdown accepts Yes or No (also Y/N and
True/False, case insensitive); blank means No. Students are added as attending,
with competing grades initially matching their actual grade. Assign Project
teams and adjust competing grades in the worksheet.

Uploads only append new students. Existing students in the school's annual
list and earlier accepted rows in the file are matched by name and grade,
ignoring name case and extra whitespace. Duplicates are skipped, without
changing existing attendance or assignments. Two students with the same name
and grade must be handled manually in the worksheet. Re-uploading a file does
not apply corrections to existing students.

Rows missing a name or usable grade, or containing unreadable team numbers or
Knowdown values, are skipped. Preview and import report added/would-add counts,
duplicate counts, skipped counts, and row numbers for skipped data. A malformed
CSV or incorrect header rejects the file. Headers are case insensitive and
must retain the template's order. Trailing empty cells may be omitted.

Contest-rule violations, including oversized teams, repeated competing grades,
and excess Knowdown nominees, do not block import. The resulting registration
remains invalid until corrected in the worksheet. Preview writes nothing;
import batches accepted rows atomically. Imports remain restricted to editable,
open regional registrations. There are no IDs, format-version fields, Project
columns, or existing student data in the template.
