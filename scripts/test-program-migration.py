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
