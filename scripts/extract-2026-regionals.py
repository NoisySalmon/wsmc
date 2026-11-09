#!/usr/bin/env python3
"""Extract legacy regional XLSX inputs to JSON. Standard library only; no DB access."""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import posixpath
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile


ROOT = Path(__file__).resolve().parents[1]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
SUMMARY_SHEETS = {"Proj", "V Tm P", "JV Tm P", "Top T", "Top I"}
SCHOOL_FIELDS = {"name": "M1", "address": "M2", "cityZip": "M3",
                 "coach": "M4", "email": "M5", "fax": "M6", "phone": "M7",
                 "division": "Y6", "varsityTeamCutoff": "A9"}
GRADE_COLUMNS = [(12, ["I", "J", "K", "L", "M", "N", "O", "P"]),
                 (11, ["Q", "R", "S", "T", "U", "V", "W", "X"]),
                 (10, ["Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF"]),
                 (9, ["AG", "AH", "AI", "AJ", "AK", "AL", "AM", "AN"])]


def read_workbook(path):
    """Read cell types, formulas, cached values, and comments without recalculation."""
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(t.text or "" for t in s.iter(f"{{{NS['m']}}}t"))
                       for s in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        relationships = {
            r.attrib["Id"]: posixpath.normpath(posixpath.join("xl", r.attrib["Target"]))
            if not r.attrib["Target"].startswith("/") else r.attrib["Target"].lstrip("/")
            for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        sheets = {}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).find("m:sheets", NS):
            cells = {}
            for c in ET.fromstring(archive.read(relationships[sheet.attrib[REL]])).findall(
                    ".//m:sheetData/m:row/m:c", NS):
                v, f, kind = c.find("m:v", NS), c.find("m:f", NS), c.get("t")
                value = v.text if v is not None else None
                if kind == "s" and value is not None:
                    value = strings[int(value)]
                elif kind == "inlineStr":
                    value = "".join(t.text or "" for t in c.findall(".//m:t", NS))
                elif kind == "b" and value is not None:
                    value = value == "1"
                elif value is not None and kind not in ("str", "e", "d"):
                    number = float(value)
                    value = int(number) if number.is_integer() else number
                if value is not None or f is not None:
                    cells[c.attrib["r"]] = {"value": value}
                    if f is not None:
                        cells[c.attrib["r"]].update(formula=f.text or "",
                                                   formulaAttributes=dict(f.attrib))
                    if kind == "e":
                        cells[c.attrib["r"]]["error"] = True
            sheets[sheet.attrib["name"]] = cells
        comments = {}
        for name in archive.namelist():
            if re.search(r"(?:^|/)comments\d*\.xml$", name):
                comments[name] = archive.read(name).decode("utf-8")
        return sheets, comments


def val(cells, address):
    return cells.get(address, {}).get("value")


def present(value):
    return value is not None and (not isinstance(value, str) or bool(value.strip()))


def text(value):
    return str(value).strip() if present(value) else None


def key(value):
    return " ".join(unicodedata.normalize("NFKC", str(value)).casefold().split())


def numeric(value):
    if not present(value):
        return None
    if isinstance(value, (float, int)) and not isinstance(value, bool):
        return value
    try:
        n = float(str(value).strip())
        return int(n) if n.is_integer() else n
    except ValueError:
        return value  # retain nonnumeric input; report it separately


def extract(path):
    sheets, comments = read_workbook(path)
    info = sheets["Info"]
    reported_region = val(info, "B1")
    region = int(path.stem) if path.stem.isdigit() else reported_region
    issues = []

    def issue(code, source, **detail):
        issues.append(dict(code=code, source=source, **detail))

    if region != reported_region:
        issue("region_number_mismatch", "Info!B1", filenameRegion=region,
              workbookRegion=reported_region)
    for field, address in [("directorName", "E1"), ("directorEmail", "E2")]:
        if not present(val(info, address)):
            issue("missing_director_field", f"Info!{address}", field=field)
    email = text(val(info, "E2"))
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        issue("invalid_email", "Info!E2", value=email)

    schools, ignored = [], []
    for sheet_name, cells in sheets.items():
        if sheet_name == "Info" or sheet_name in SUMMARY_SHEETS:
            continue
        if val(cells, "J1") != "School":
            if cells:
                issue("unrecognized_sheet", sheet_name)
            ignored.append(sheet_name)
            continue
        rows = []
        input_addresses = set(SCHOOL_FIELDS.values())
        for grade, columns in GRADE_COLUMNS:
            for r in range(13, 33):
                addresses = [f"{c}{r}" for c in columns]
                input_addresses.update(addresses[:7])
                values = [val(cells, a) for a in addresses]
                if not any(present(v) for v in values[:7]):
                    continue
                raw_name = text(values[0])
                if raw_name is None:
                    issue("student_inputs_without_name", f"{sheet_name}!{addresses[0]}")
                # Administrators used both xAnna and XAnna. Xanth/Xavier/Xinhui
                # are real names, so an uppercase X before a lowercase letter
                # is not a duplicate marker.
                play_up = bool(raw_name and (raw_name.startswith("x") or
                               (raw_name.startswith("X") and len(raw_name) > 1
                                and (raw_name[1].isupper() or raw_name[1].isspace()))))
                rows.append(dict(id=f"r{region}-{sheet_name}-{addresses[0]}",
                                 source=f"{sheet_name}!{addresses[0]}",
                                 sourceCells=dict(zip(["name", "projectTeam", "teamContestTeam",
                                                      "topicalTeam", "knowdown", "part1", "part2", "cachedTotal"], addresses)),
                                 rawName=values[0], name=raw_name[1:].strip() if play_up else raw_name,
                                 competingGrade=grade, isPlayUp=play_up, studentId=None,
                                 projectTeam=numeric(values[1]), teamContestTeam=numeric(values[2]),
                                 topicalTeam=numeric(values[3]), knowdownMarker=values[4],
                                 knowdown=present(values[4]),
                                 topicalIndividual=dict(part1=numeric(values[5]), part2=numeric(values[6]),
                                                        cachedTotal=values[7])))
        score_addresses = {f"C{r}" for r in list(range(4, 9)) + list(range(13, 33))}
        score_addresses.update(f"{c}{r}" for c in ["F", "G"] for r in range(3, 33))
        input_addresses.update(score_addresses)
        populated = (any(present(val(cells, a)) for a in [f"M{r}" for r in range(1, 8)])
                     or rows or any(present(val(cells, a)) for a in score_addresses))
        if not populated:
            ignored.append(sheet_name)
            continue
        school = {field: (numeric(val(cells, a)) if field in ("division", "varsityTeamCutoff")
                          else text(val(cells, a))) for field, a in SCHOOL_FIELDS.items()}
        school.update(id=f"r{region}-{sheet_name}", sourceSheet=sheet_name,
                      sourceCells=SCHOOL_FIELDS, students=[], studentRecords=rows, entries=[])
        schools.append(school)
        if not school["name"]:
            issue("missing_school_name", sheet_name)
        if school["division"] not in (1, 2):
            issue("invalid_division", f"{sheet_name}!Y6", value=school["division"])
        if school["email"] and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", school["email"]):
            issue("invalid_email", f"{sheet_name}!M5", value=school["email"])
        for a in sorted(input_addresses):
            if "formula" in cells.get(a, {}):
                issue("formula_in_input", f"{sheet_name}!{a}", cachedValue=val(cells, a))
        # Only exact normalized names within the same school can link play-up copies.
        bases = {}
        for row in rows:
            if row["name"] and not row["isPlayUp"]:
                student = dict(id=row["id"], name=row["name"], actualGrade=row["competingGrade"],
                               source=row["source"])
                school["students"].append(student)
                row["studentId"] = student["id"]
                bases.setdefault(key(row["name"]), []).append(student)
        for name, matches in bases.items():
            if len(matches) > 1:
                issue("duplicate_base_name", sheet_name, name=name,
                      studentIds=[s["id"] for s in matches])
        for row in rows:
            if not row["isPlayUp"] or not row["name"]:
                continue
            matches = bases.get(key(row["name"]), [])
            if len(matches) == 1 and matches[0]["actualGrade"] < row["competingGrade"]:
                row["studentId"] = matches[0]["id"]
            else:
                issue("unresolved_play_up", row["source"], name=row["name"],
                      candidateStudentIds=[s["id"] for s in matches])

        def entry(category, number, members, score, source, **extra):
            e = dict(id=f"{school['id']}-{category}-{number}", category=category,
                     entryNumber=number, division=school["division"],
                     members=[dict(recordId=r["id"], studentId=r["studentId"],
                                   competingGrade=r["competingGrade"]) for r in members],
                     result=score, source=source, **extra)
            school["entries"].append(e)
            if not members:
                issue("score_without_members", source, entryId=e["id"])
            for field, value in score.items():
                if field == "cachedTotal" or value is None:
                    continue
                if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
                    issue("invalid_score", source, field=field, value=value)
                elif field in ("part1", "part2") and value > 75:
                    issue("topical_part_out_of_range", source, field=field, value=value)
            return e

        for category, member_field, number_col, score_cols, score_rows in [
                ("project", "projectTeam", "A", ["C"], range(4, 9)),
                ("team_contest", "teamContestTeam", "A", ["C"], range(13, 33)),
                ("topical_team", "topicalTeam", "D", ["F", "G"], range(3, 33))]:
            used_numbers = set()
            for r in score_rows:
                number = numeric(val(cells, f"{number_col}{r}"))
                members = [row for row in rows if row[member_field] is not None and row[member_field] == number]
                scores = [numeric(val(cells, f"{c}{r}")) for c in score_cols]
                if not members and not any(v is not None for v in scores):
                    continue
                if number in used_numbers:
                    issue("duplicate_team_number", f"{sheet_name}!{number_col}{r}", category=category, number=number)
                used_numbers.add(number)
                result = dict(score=scores[0]) if len(scores) == 1 else dict(part1=scores[0], part2=scores[1], cachedTotal=val(cells, f"H{r}"))
                extra = {}
                if category == "team_contest":
                    cutoff = school["varsityTeamCutoff"]
                    extra["level"] = ("varsity" if number <= cutoff else "jv") if isinstance(number, (int, float)) and isinstance(cutoff, (int, float)) else None
                e = entry(category, number, members, result, f"{sheet_name}!{number_col}{r}", **extra)
                e["id"] += f"-row{r}"  # source template contains duplicate topical team 13
            for row in rows:
                number = row[member_field]
                if number is not None and number not in used_numbers:
                    issue("team_number_without_score_slot", row["source"], category=category, number=number)
        for row in rows:
            ti = row["topicalIndividual"]
            if row["topicalTeam"] is None or any(ti[k] is not None for k in ("part1", "part2")):
                entry("topical_individual", row["id"], [row], ti, row["source"])
            if row["topicalTeam"] is not None and any(ti[k] is not None for k in ("part1", "part2")):
                issue("both_topical_team_and_individual", row["source"])
            if row["knowdown"]:
                entry("knowdown", row["id"], [row], {}, row["source"])

    knowdown = []
    for r in range(5, 9):
        name, school_name = text(val(info, f"B{r}")), text(val(info, f"E{r}"))
        item = dict(placement=r - 4 if r < 8 else None, alternate=r == 8,
                    name=name, school=school_name, source=f"Info!B{r}:E{r}",
                    studentId=None, schoolId=None)
        if name and key(name) not in ("n/a", "na", "none"):
            candidates = [(s, st) for s in schools for st in s["students"]
                          if key(st["name"]) == key(name) and school_name
                          and key(s["name"]) == key(school_name)]
            if len(candidates) == 1:
                item.update(studentId=candidates[0][1]["id"], schoolId=candidates[0][0]["id"])
            else:
                issue("unresolved_knowdown_result", item["source"], name=name, school=school_name)
        knowdown.append(item)

    # All literal cells, including unexpected edits, are retained independently of parsing.
    source_sheets = {}
    for name, cells in sheets.items():
        literals = {a: c["value"] for a, c in cells.items() if "formula" not in c}
        cached = {a: c for a, c in cells.items() if "formula" in c and present(c["value"])}
        errors = [a for a, c in cells.items() if c.get("error")]
        if errors:
            issue("workbook_cell_errors", name, cells=errors)
        source_sheets[name] = dict(literalCells=literals, cachedFormulaCells=cached)
    result = dict(schemaVersion=1, year=2026, regionNumber=region,
                  workbookRegionNumber=reported_region, isVirtual=region == 11,
                  source=dict(file=path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else str(path),
                              sha256=hashlib.sha256(path.read_bytes()).hexdigest()),
                  director=dict(name=text(val(info, "E1")), email=email,
                                sourceCells=dict(name="Info!E1", email="Info!E2")),
                  knowdownResults=knowdown, schools=schools, ignoredEmptySheets=ignored,
                  sourceSheets=source_sheets, sourceCommentsXml=comments, issues=issues)
    result["counts"] = dict(schools=len(schools), students=sum(len(s["students"]) for s in schools),
                            studentRecords=sum(len(s["studentRecords"]) for s in schools),
                            playUpRecords=sum(r["isPlayUp"] for s in schools for r in s["studentRecords"]),
                            entries=sum(len(s["entries"]) for s in schools),
                            issues=len(issues), literalCells=sum(len(s["literalCells"]) for s in source_sheets.values()))
    # Structural coverage checks fail the extraction rather than silently dropping records.
    assert result["counts"]["literalCells"] == sum("formula" not in c for s in sheets.values() for c in s.values())
    ids = [e["id"] for s in schools for e in s["entries"]]
    assert len(ids) == len(set(ids)), "Duplicate entry IDs"
    for s in schools:
        student_ids = {st["id"] for st in s["students"]}
        assert all(r["studentId"] is None or r["studentId"] in student_ids for r in s["studentRecords"])
        assert all(m["recordId"] in {r["id"] for r in s["studentRecords"]} for e in s["entries"] for m in e["members"])
    return result


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "legacy/2026-regionals")
    parser.add_argument("--output", type=Path, default=ROOT / "scripts/data/2026-regionals")
    args = parser.parse_args()
    paths = sorted(args.source.resolve().glob("*.xlsx"), key=lambda p: (not p.stem.isdigit(), int(p.stem) if p.stem.isdigit() else p.stem))
    if not paths:
        parser.error("No XLSX workbooks found")
    args.output.mkdir(parents=True, exist_ok=True)
    summary = []
    for path in paths:
        result = extract(path)
        filename = f"region-{result['regionNumber']:02d}.json"
        if filename in [s["file"] for s in summary]:
            raise ValueError(f"Multiple workbooks map to {filename}")
        write_json(args.output / filename, result)
        summary.append(dict(file=filename, source=result["source"], regionNumber=result["regionNumber"],
                            counts=result["counts"], issueCounts=dict(Counter(i["code"] for i in result["issues"]))))
        print(filename, result["counts"])
    write_json(args.output / "manifest.json", dict(schemaVersion=1, year=2026, regions=summary,
               totals=dict(sum((Counter(s["counts"]) for s in summary), Counter()))))


if __name__ == "__main__":
    main()
