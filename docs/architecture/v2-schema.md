# V2 schema and relationship decisions

The v2 baseline is implemented in
[`src/lib/server/db/schema.ts`](../../src/lib/server/db/schema.ts) and reset by
[`drizzle/0001_v2_baseline.sql`](../../drizzle/0001_v2_baseline.sql).

## Relationship map

| Group | Relationship | Cardinality and invariant |
| --- | --- | --- |
| Identity | `users` → `sessions` | One user has zero or many sessions; a session belongs to one user and can be revoked. |
| Identity | `users` → `sign_in_tokens` | One user has zero or many hashed, expiring tokens; token replay is prevented by application state. |
| Program | `seasons` → `regions` | One season has many numbered regions; region numbers are unique within a season. |
| Program | `seasons` → `contests` | A season has one state contest and at most one regional contest per region; lifecycle is contest-specific. |
| Organizations | `schools` → `school_participations` | Schools persist across seasons; participation carries contest invitation status and annual division. |
| Authorization | `users` → assignment tables | Assignments are many-to-many and scoped by season, contest, or school; a user can hold overlapping capabilities. |
| People | `seasons` + `schools` → `annual_students` | Students are fresh per season and belong to one school; actual grade is stored here. |
| Registration | `school_participations` → `contest_roster_members` | A roster row belongs to one contest participation and one annual student; a student can be rostered once per contest. |
| Competition | `contests` → `entries` | Entries belong to one contest, category, kind, division, and optional owner school. A null owner permits state cross-school entries. |
| Competition | `entries` → `entry_members` | An entry has one or many members; membership is unique per entry/student. Team competing grade is stored on this row. |
| Competition | `entries` → `results` | Results are one-to-zero-or-one per entry, with one optimistic version and nullable score/parts/placement. Category-specific completeness is a domain rule. |
| Qualification | `qualification_rounds` → `qualifications` → `qualification_reasons` | A round freezes a set of qualifications; one qualification may retain multiple distinct reasons. |
| State | `qualifications` → `state_team_berths` | A team qualification can produce one state berth; the state entry is a new entry preserving regional history. |
| State | `state_attendances` and `state_roster_members` | Attendance is one school intent per state contest; each state-rostered student has an explicit admission basis. |
| Operations | `audit_events` and `imports` | Imports and audit events are append-oriented operational records with actor and contest/school context where applicable. |

## Deliberate boundary choices

- Foreign keys protect row existence, while repositories must validate that
  related rows share the requested contest and season. This is necessary for
  contest-scoped IDOR protection because SQLite cannot express every scoped
  relationship with a single-column foreign key.
- The `entries` abstraction is shared across categories. `entryKind` is stored
  explicitly and checked by application services against the category so a
  malformed client cannot turn an individual into a team.
- Individual `entry_members.competing_grade` is null. Team members must supply
  the grade for that particular entry, and domain validation checks playing-up
  and distinct grades.
- Results intentionally use nullable score fields: blank is not zero. The
  domain/service layer validates which fields are required for each category.
- Qualification records are not recomputed in place after publication. Later
  score corrections can create a review item, but do not silently rewrite a
  published round.
