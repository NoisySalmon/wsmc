#!/usr/bin/env python3
"""Exercise the results seed's CLI against the real migrated storage contract."""
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="wsmc-results-check-") as temp:
    sql = Path(temp) / "results.sql"
    report_path = Path(temp) / "report.json"
    subprocess.run(["node", "scripts/generate-2026-results.mjs", str(sql), str(report_path)],
                   cwd=ROOT, check=True)
    report = json.loads(report_path.read_text())
    db = sqlite3.connect(":memory:")
    for migration in sorted((ROOT / "drizzle").glob("*.sql")):
        db.executescript(migration.read_text())
    db.executescript((ROOT / "scripts/seed.sql").read_text())

    def scalar(query, args=()):
        return db.execute(query, args).fetchone()[0]

    # The same seed must replace both an existing fixture and archived history.
    for replay in range(2):
        db.executescript(sql.read_text())
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert scalar("PRAGMA integrity_check") == "ok"
        assert db.execute("SELECT year, status FROM seasons").fetchall() == [(2026, "qualifications")]
        assert scalar("SELECT count(*) FROM contests WHERE kind='regional' AND lifecycle='finalized'") == 11
        assert scalar("SELECT count(*) FROM contests WHERE kind='state' AND lifecycle='setup'") == 1
        assert scalar("SELECT count(*) FROM contests WHERE results_published_at IS NOT NULL") == 0
        assert scalar("SELECT count(*) FROM qualification_rounds") == 1
        draft = db.execute("SELECT status,thresholds_json FROM qualification_rounds WHERE kind='state_cutoff'").fetchone()
        assert draft[0] == 'draft'
        assert json.loads(draft[1]) == {"project": {"1": 0, "2": 0}, "team_contest": {"1": 14, "2": 10}, "topical_team": {"1": 89, "2": 68}, "topical_individual": {"1": 50, "2": 50}}
        assert scalar("SELECT count(*) FROM qualifications") == 0
        assert scalar("SELECT count(*) FROM state_roster_members") == 0
        assert scalar("SELECT count(*) FROM statewide_assignments a JOIN users u ON u.id=a.user_id WHERE u.email='coordinator@wsmc.example' AND u.status='active'") == 1
        assert scalar("SELECT count(*) FROM users WHERE email LIKE '% %'") == 0
        # A real two-part score and an apostrophe survive the SQL generation boundary.
        assert db.execute("SELECT r.part1,r.part2,r.score FROM results r JOIN entries e ON e.id=r.entry_id JOIN schools s ON s.id=e.owner_school_id WHERE s.name='Oakesdale' AND e.category='topical_team' AND e.entry_number=1").fetchone() == (31, 37, 68)
        assert scalar("SELECT count(*) FROM schools WHERE name=?", ("King's",)) == 1
        # Team Problem and Topical Team remain independent, rather than copying rosters.
        def team_students(category):
            return {row[0] for row in db.execute("SELECT a.id FROM entry_members m JOIN annual_students a ON a.id=m.annual_student_id JOIN entries e ON e.id=m.entry_id JOIN schools s ON s.id=e.owner_school_id WHERE s.name='Bear Creek' AND e.category=? AND e.entry_number=1", (category,))}
        assert team_students("team_contest") == {"r6-S6-I13", "r6-S6-Q14", "r6-S6-AG15"}
        assert team_students("topical_team") == {"r6-S6-I13", "r6-S6-Q15", "r6-S6-AG14"}
        # One annual identity per resolved play-up, with the explicit competing grade.
        assert db.execute("SELECT a.id,a.actual_grade,m.competing_grade FROM annual_students a JOIN entry_members m ON m.annual_student_id=a.id JOIN entries e ON e.id=m.entry_id JOIN schools s ON s.id=a.school_id WHERE s.name='Discovery' AND a.id='r8-S1-AG13' AND e.category='team_contest'").fetchall() == [("r8-S1-AG13", 9, 11)]
        # Unknown actual grades and out-of-range parts are reported, never fabricated/clamped.
        assert scalar("SELECT count(*) FROM annual_students WHERE id='r11-Liberty-I16'") == 0
        assert scalar("SELECT count(*) FROM results WHERE part1>75 OR part2>75") == 0
        incomplete = next(i for i in report["incomplete"] if i["reason"] == "topical_part_out_of_range" and i["value"] == 115)
        assert db.execute("SELECT score,part1,part2 FROM results WHERE entry_id=?", (incomplete["entryId"],)).fetchone() == (None, None, None)
        assert scalar("SELECT count(*) FROM audit_events WHERE action='historical_results_seeded' AND details_json LIKE '%115%'") > 0
        assert scalar("SELECT count(*) FROM results r JOIN entries e ON e.id=r.entry_id WHERE e.category='knowdown' AND r.placement=4 AND r.knowdown_outcome='placed'") > 0
        # Reviewed school aliases must survive the real seed/storage boundary.
        assert db.execute("SELECT r.placement,r.knowdown_outcome FROM results r JOIN entries e ON e.id=r.entry_id JOIN entry_members m ON m.entry_id=e.id WHERE e.category='knowdown' AND m.annual_student_id='r5-S4-I13'").fetchall() == [(2, 'placed')]
        db.execute("UPDATE seasons SET status='archived'")
    print("2026 results seed storage checks passed (including archived-history replacement).")
