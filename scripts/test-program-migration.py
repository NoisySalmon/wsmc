"""Exercise legacy upgrade and permanent archive protection against real SQLite."""
import sqlite3
from pathlib import Path

db = sqlite3.connect(':memory:')
for migration in sorted(Path('drizzle').glob('*.sql')):
    if migration.name.startswith('0004'):
        break
    db.executescript(migration.read_text())
db.execute("INSERT INTO seasons (id, year, name, status) VALUES ('season', 2026, '2026 WSMC', 'active')")
db.execute("INSERT INTO regions (id, season_id, number, name) VALUES ('region', 'season', 1, 'Spokane')")
db.execute("INSERT INTO contests (id, season_id, region_id, kind, name) VALUES ('regional', 'season', 'region', 'regional', 'Regional')")
db.executescript(Path('drizzle/0004_program_stages.sql').read_text())
assert db.execute("SELECT status FROM seasons").fetchone() == ('regional',)
assert db.execute("SELECT count(*) FROM contests WHERE kind = 'state'").fetchone() == (1,)
assert 'settings_json' not in [row[1] for row in db.execute('PRAGMA table_info(contests)')]

def rejected(statement):
    try:
        db.execute(statement)
    except sqlite3.IntegrityError:
        return
    raise AssertionError(f'Write should have been blocked: {statement}')

rejected("INSERT INTO seasons (id, year, name) VALUES ('next', 2027, 'Next')")
db.execute("INSERT INTO entries (id, contest_id, owner_school_id, category, entry_kind, division) VALUES ('entry', 'regional', NULL, 'team_contest', 'team', 1)")
# Historical account attribution must survive the later access schema reset.
db.executescript("""
INSERT INTO users (id, email, status) VALUES ('actor', 'actor@example.test', 'active');
INSERT INTO schools (id, name) VALUES ('school', 'School');
INSERT INTO statewide_assignments (id, user_id, season_id) VALUES ('admin', 'actor', 'season');
INSERT INTO regional_coordinator_assignments (user_id, contest_id) VALUES ('actor', 'regional');
INSERT INTO coach_assignments (user_id, season_id, school_id) VALUES ('actor', 'season', 'school');
INSERT INTO scorekeeper_assignments (user_id, contest_id) VALUES ('actor', 'regional');
INSERT INTO results (entry_id, score, last_edited_by) VALUES ('entry', 42, 'actor');
INSERT INTO audit_events (id, actor_user_id, contest_id, entity_type, entity_id, action)
VALUES ('event', 'actor', 'regional', 'result', 'entry', 'result_saved');
INSERT INTO imports (id, contest_id, kind, filename, status, created_by)
VALUES ('import', 'regional', 'score', 'scores.csv', 'committed', 'actor');
INSERT INTO qualification_rounds (id, season_id, kind, created_by)
VALUES ('round', 'season', 'regional_placements', 'actor');
INSERT INTO state_attendances (contest_id, school_id, updated_by)
VALUES ('regional', 'school', 'actor');
""")
db.execute("UPDATE seasons SET status = 'archived' WHERE id = 'season'")
for statement in [
    "UPDATE seasons SET status = 'regional' WHERE id = 'season'",
    "DELETE FROM seasons WHERE id = 'season'",
    "UPDATE contests SET starts_at = 123 WHERE id = 'regional'",
    "DELETE FROM regions WHERE id = 'region'",
    "DELETE FROM entries WHERE id = 'entry'",
    "INSERT INTO results (entry_id, score) VALUES ('entry', 12)",
    "INSERT INTO regions (id, season_id, number) VALUES ('new', 'season', 2)",
]:
    rejected(statement)
db.execute("INSERT INTO seasons (id, year, name) VALUES ('next', 2027, 'Next')")
# A new season cannot absorb an archived record.
rejected("UPDATE contests SET season_id = 'next' WHERE id = 'regional'")
print('program migration checks passed: legacy upgrade, state backfill, one current season, permanent archive')

# Removing redundant names must also upgrade archived history without weakening guards.
db.executescript(Path('drizzle/0005_season_year.sql').read_text())
assert 'name' not in [row[1] for row in db.execute('PRAGMA table_info(seasons)')]
assert db.execute("SELECT year, status FROM seasons WHERE id = 'season'").fetchone() == (2026, 'archived')
rejected("UPDATE seasons SET year = 2025 WHERE id = 'season'")
print('year-only season upgrade preserves archived history and protection')

# The pre-launch migration intentionally resets only the three changing roles.
preserved_tables = ['users', 'seasons', 'regions', 'contests', 'schools', 'entries',
                    'results', 'audit_events', 'imports', 'qualification_rounds',
                    'state_attendances', 'scorekeeper_assignments']
before = {table: db.execute(f'SELECT * FROM {table}').fetchall() for table in preserved_tables}
db.executescript(Path('drizzle/0006_persistent_access.sql').read_text())
assert before == {table: db.execute(f'SELECT * FROM {table}').fetchall() for table in preserved_tables}
for table in ['statewide_assignments', 'regional_coordinator_assignments', 'coach_assignments']:
    assert db.execute(f'SELECT count(*) FROM {table}').fetchone() == (0,)
# New persistent grants are independent of archived seasons.
db.execute("INSERT INTO statewide_assignments (user_id) VALUES ('actor')")
db.execute("INSERT INTO regional_coordinator_assignments (user_id, region_number) VALUES ('actor', 1)")
db.execute("INSERT INTO coach_assignments (user_id, school_id) VALUES ('actor', 'school')")
rejected("INSERT INTO statewide_assignments (user_id) VALUES ('actor')")
rejected("INSERT INTO regional_coordinator_assignments (user_id, region_number) VALUES ('actor', 1)")
rejected("INSERT INTO regional_coordinator_assignments (user_id, region_number) VALUES ('actor', 0)")
rejected("INSERT INTO coach_assignments (user_id, school_id) VALUES ('actor', 'school')")
db.execute("DELETE FROM regional_coordinator_assignments WHERE user_id = 'actor'")
rejected("UPDATE results SET last_edited_by = NULL WHERE entry_id = 'entry'")
assert db.execute('PRAGMA foreign_key_check').fetchall() == []
print('persistent access reset preserves accounts, event grants, historical attribution, and archive guards')
