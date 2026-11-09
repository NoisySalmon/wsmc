#!/usr/bin/env python3
"""Rehearse pending migrations on a private export and prepare access restoration.

Never connects to Cloudflare. Output contains account IDs and belongs outside git.
"""
import argparse
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('export', type=Path)
parser.add_argument('restore_sql', type=Path)
args = parser.parse_args()
if args.export.resolve() == args.restore_sql.resolve():
    parser.error('The export and restore output must be different files.')
db = sqlite3.connect(':memory:')
db.executescript(args.export.read_text())


def records(table):
    return sorted(db.execute(f'SELECT * FROM {table}').fetchall())


accounts = records('users')
sessions = records('sessions')
tokens = records('sign_in_tokens')
counts = {table: db.execute(f'SELECT count(*) FROM {table}').fetchone()[0]
          for table in ['schools', 'annual_students', 'contests', 'entries', 'results']}
admins = db.execute('SELECT user_id, MIN(created_at) FROM statewide_assignments GROUP BY user_id').fetchall()
regional_columns = {row[1] for row in db.execute('PRAGMA table_info(regional_coordinator_assignments)')}
if 'region_number' in regional_columns:
    regionals = db.execute('SELECT user_id, region_number, MIN(created_at) FROM regional_coordinator_assignments GROUP BY user_id,region_number').fetchall()
else:
    regionals = db.execute('''SELECT a.user_id, r.number, MIN(a.created_at)
        FROM regional_coordinator_assignments a JOIN contests c ON c.id=a.contest_id
        JOIN regions r ON r.id=c.region_id GROUP BY a.user_id,r.number''').fetchall()
coaches = db.execute('SELECT user_id,school_id,MIN(created_at) FROM coach_assignments GROUP BY user_id,school_id').fetchall()
scorekeepers = records('scorekeeper_assignments')
applied = {row[0] for row in db.execute('SELECT name FROM d1_migrations')}
pending = [path for path in sorted((ROOT / 'drizzle').glob('*.sql')) if path.name not in applied]
for path in pending:
    db.executescript(path.read_text())


def quote(value):
    return 'NULL' if value is None else str(value) if isinstance(value, int) else "'" + value.replace("'", "''") + "'"


statements = ['-- Private access restoration prepared from a pre-migration export.']
for table, columns, rows in [
    ('statewide_assignments', 'user_id,created_at', admins),
    ('regional_coordinator_assignments', 'user_id,region_number,created_at', regionals),
    ('coach_assignments', 'user_id,school_id,created_at', coaches),
]:
    for row in rows:
        statements.append(f'INSERT OR IGNORE INTO {table} ({columns}) VALUES ({", ".join(map(quote, row))});')
restore = '\n'.join(statements) + '\n'
db.executescript(restore)
assert records('users') == accounts, 'Migration changed account records'
assert records('sessions') == sessions, 'Migration changed session records'
assert records('sign_in_tokens') == tokens, 'Migration changed sign-in tokens'
assert records('scorekeeper_assignments') == scorekeepers, 'Migration changed scorekeeper grants'
for table, count in counts.items():
    assert db.execute(f'SELECT count(*) FROM {table}').fetchone()[0] == count, f'Migration changed {table} count'
assert db.execute('SELECT count(*) FROM statewide_assignments').fetchone()[0] == len(admins)
assert db.execute('SELECT count(*) FROM regional_coordinator_assignments').fetchone()[0] == len(regionals)
assert db.execute('SELECT count(*) FROM coach_assignments').fetchone()[0] == len(coaches)
assert not db.execute('PRAGMA foreign_key_check').fetchall()
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
args.restore_sql.parent.mkdir(parents=True, exist_ok=True)
# Restrict permissions before writing any private IDs.
fd = args.restore_sql.open('w')
try:
    args.restore_sql.chmod(0o600)
    fd.write(restore)
finally:
    fd.close()
print(f'Rehearsed {len(pending)} migrations. Preserved {len(accounts)} accounts, {len(sessions)} sessions, and all competition counts.')
print(f'Restored {len(admins)} admin grants, {len(regionals)} regional grants, and {len(coaches)} coach grants in the isolated copy.')
print('Private restoration SQL written. No remote database was modified.')
