#!/usr/bin/env python3
"""Compare private 2026 inputs; produce a reviewed identity overlay and audit report.

Requires Poppler's pdftotext. Never modifies workbooks or raw extraction JSON.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'scripts/data/2026-regionals'
PDF = ROOT / 'State Math/2026/Statewide Regional Results 2026.pdf'


def key(value):
    return ' '.join(unicodedata.normalize('NFKC', str(value)).casefold().split())


# Explicit reviewed aliases only; no fuzzy matching or guessed actual grades.
SCHOOLS = {'mt. spokane': 'mt spokane', 'jackson': 'henry m jackson',
           'wenatchhe': 'wenatchee'}
# Region, entered placement name -> roster spelling. The PDF confirms the
# placement/school; the original roster remains the identity and grade source.
NAMES = {(3, 'klye strickler'): 'Kyle Strickler',
         (4, 'zachary wyckoff'): 'Zachery Wyckoff',
         (7, 'mathew correll'): 'Matthew Correl',
         (9, 'issac qaisi'): 'Issac Quisi'}


def school_key(name):
    return SCHOOLS.get(key(name), key(name))


def main():
    pages = subprocess.check_output(['pdftotext', '-layout', str(PDF), '-'], text=True).split('\f')
    regions = [json.loads(p.read_text()) for p in sorted(DATA.glob('region-*.json'))]
    reference = {'file': str(PDF.relative_to(ROOT)), 'sha256': hashlib.sha256(PDF.read_bytes()).hexdigest()}
    overlay = {'schemaVersion': 1, 'reference': reference, 'regions': []}
    report = {'reference': reference, 'policy': 'Qualifier list only: absence is not evidence of a wrong regional result. No scores, memberships, or grades are inferred.',
              'knowdown': [], 'teams': [], 'otherReferencePages': {}}
    for region in regions:
        changes = []
        for outcome in region['knowdownResults']:
            if not outcome['name'] or key(outcome['name']) in ('n/a', 'na', 'none'):
                continue
            name = NAMES.get((region['regionNumber'], key(outcome['name'])), outcome['name'])
            matches = [(s, st) for s in region['schools'] for st in s['students']
                       if school_key(s['name']) == school_key(outcome['school']) and key(st['name']) == key(name)]
            # PDF and workbook must agree on this slot's name, school and place.
            # Two visual columns are separated by >=2 spaces in Poppler output.
            pdf_name = 'Kyle Strickler' if key(outcome['name']) == 'klye strickler' else outcome['name']
            confirmed = any(re.search(r'(?<!\S)' + re.escape(pdf_name) + r'\s{2,}' +
                            re.escape('Wenatchee' if outcome['school'] == 'Wenatchhe' else outcome['school']) +
                            r'\s{2,}' + ('Alt' if outcome['alternate'] else str(outcome['placement'])) + r'(?!\w)', line, re.I)
                            for line in pages[0].splitlines())
            item = dict(region=region['regionNumber'], source=outcome['source'], original=outcome,
                        pdfConfirmed=confirmed, candidateStudentIds=[st['id'] for _, st in matches])
            if outcome['studentId']:
                item['status'] = 'already_linked'
            elif len(matches) == 1 and confirmed:
                s, st = matches[0]
                change = dict(source=outcome['source'], originalName=outcome['name'], originalSchool=outcome['school'],
                              studentId=st['id'], schoolId=s['id'], evidence='PDF page 1 placement + reviewed school/name alias + roster actual grade')
                changes.append(change)
                item.update(status='identity_resolved', correction=change)
            else:
                item['status'] = 'needs_review'
            report['knowdown'].append(item)
        overlay['regions'].append(dict(regionNumber=region['regionNumber'], sourceSha256=region['source']['sha256'], knowdown=changes))
    # Pages 2-5: preserve printed member names and compare exact roster sets.
    for page_number, category, division in [(2, 'team_contest', 1), (3, 'team_contest', 2), (4, 'topical_team', 1), (5, 'topical_team', 2)]:
        count = 0
        for line in pages[page_number - 1].splitlines():
            cells = re.split(r'\s{2,}', line.strip())
            if len(cells) < 5 or not re.fullmatch(r'\d+|V', cells[0]) or not re.fullmatch(r'\d+', cells[1]):
                continue
            n = 11 if cells[0] == 'V' else int(cells[0])
            score = float(cells[2])
            school_name, members = cells[3], cells[4:]
            count += 1
            schools = [s for r in regions if r['regionNumber'] == n for s in r['schools']
                       if school_key(s['name']) == school_key(school_name)]
            candidates = []
            for s in schools:
                records = {r['id']: r for r in s['studentRecords']}
                for e in s['entries']:
                    if e['category'] != category or e['division'] != division:
                        continue
                    names = [records[m['recordId']]['rawName'] for m in e['members']]
                    if {key(x) for x in names} == {key(x) for x in members}:
                        result = e['result']
                        total = result.get('score') if category == 'team_contest' else (
                            result['part1'] + result['part2'] if all(isinstance(result.get(k), (int, float)) for k in ('part1', 'part2')) else None)
                        candidates.append(dict(entryId=e['id'], source=e['source'], total=total, level=e.get('level')))
            status = 'needs_identity_review'
            if len(candidates) == 1:
                status = 'agrees' if candidates[0]['total'] == score else 'score_conflict_or_incomplete'
                if candidates[0]['level'] == 'jv':
                    status = 'excluded_jv_in_seed'
            elif len(candidates) > 1:
                status = 'ambiguous_entry'
            report['teams'].append(dict(page=page_number, region=n, category=category, division=division,
                                        place=int(cells[1]), score=score, school=school_name, members=members,
                                        status=status, candidates=candidates))
        if count != {2: 37, 3: 31, 4: 39, 5: 27}[page_number]:
            raise ValueError(f'Incomplete PDF table extraction on page {page_number}: {count}')
    # Retain pages needing manual identity review rather than claiming coverage.
    report['otherReferencePages'] = {'projectsPage1': pages[0].split('Regional Team Projects', 1)[1].split('Knowdown', 1)[0].strip(),
                                     'individualsPage6': pages[5].strip(),
                                     'status': 'Reference retained; project and individual row reconciliation pending.'}
    for filename, value in [('reconciliation.json', overlay), ('reconciliation-report.json', report)]:
        (DATA / filename).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    from collections import Counter
    print('Knowdown:', dict(Counter(x['status'] for x in report['knowdown'])))
    print('PDF team rows:', dict(Counter(x['status'] for x in report['teams'])))


if __name__ == '__main__':
    main()
