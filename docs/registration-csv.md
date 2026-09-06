# Registration CSV v1

The regional registration download uses the `wsmc.registration.v1` format. It
is a wide, one-row-per-annual-student CSV so a coach can edit a school’s
annual list, contest roster, and category memberships in a spreadsheet.

The columns are:

```text
format_version,student_id,student_name,actual_grade,rostered,
project_entry_id,project_entry_number,project_competing_grade,
team_contest_entry_id,team_contest_entry_number,team_contest_competing_grade,
topical_team_entry_id,topical_team_entry_number,topical_team_competing_grade,
topical_individual_entry_id,topical_individual_entry_number,
knowdown_entry_id,knowdown_entry_number,knowdown_selected
```

Stable `student_id` and `*_entry_id` values are included for existing records.
Leave a student ID blank to add a new annual student. New category entries
must use a positive entry number; rows with the same category and entry number
join the same team or individual entry. Team membership requires a competing
grade and individual membership leaves the competing-grade column blank.

Use `yes` or `no` for `rostered` and `knowdown_selected`. A blank category
reference means that student is not a member of that category. The import
does not delete annual students omitted from the file, but it does make the
roster and category memberships for included students match the file.

Preview parses and validates the complete file without writing. Import repeats
the validation inside an all-or-nothing transaction, is safe to repeat, and
respects the Registration open lifecycle gate and the same team, grade,
Topical, and Knowdown rules as the registration UI. Exported text beginning
with `=`, `+`, `-`, or `@` is prefixed for spreadsheet safety and restored when
read back by WSMC.
