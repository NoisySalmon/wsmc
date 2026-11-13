#!/usr/bin/env python3
"""Restore the private state-registration snapshot into the local Wrangler database."""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
snapshot = root / '.local/snapshots/state-2026-state-registration.sqlite'
if not snapshot.is_file():
    raise SystemExit(f'Snapshot is missing: {snapshot}')
databases = list((root / '.wrangler/state/v3/d1').glob('*/*.sqlite'))
if len(databases) != 1:
    raise SystemExit('Expected exactly one local Wrangler database; refusing to guess.')

with sqlite3.connect(f'{snapshot.as_uri()}?mode=ro', uri=True) as source:
    if source.execute('PRAGMA integrity_check').fetchone() != ('ok',):
        raise SystemExit('Snapshot failed its integrity check.')
    stage = source.execute("SELECT lifecycle FROM contests WHERE id='contest-state-2026'").fetchone()
    if stage != ('registration_open',):
        raise SystemExit('Snapshot is not the expected state-registration state.')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = snapshot.parent / f'before-restore-{stamp}.sqlite'
    with sqlite3.connect(databases[0], timeout=30) as destination:
        with sqlite3.connect(backup) as previous:
            destination.backup(previous)
        source.backup(destination)

print('Restored the full local database to State 2026 state-registration (registration open).')
print(f'Previous local data backed up to {backup}')
