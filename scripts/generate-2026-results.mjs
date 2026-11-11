// Generate a local replay snapshot from extracted workbooks. No database access.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const output = process.argv[2];
const reportPath = process.argv[3];
if (!output || !reportPath) throw new Error('Usage: node scripts/generate-2026-results.mjs OUTPUT.sql REPORT.json');
const base = new URL('./data/2026-regionals/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', base)));
const reconciliationUrl = new URL('reconciliation.json', base);
const reconciliation = existsSync(reconciliationUrl) ? JSON.parse(readFileSync(reconciliationUrl)) : null;
if (reconciliation && reconciliation.schemaVersion !== 1) throw new Error('Unsupported reconciliation schema');
const directory = JSON.parse(readFileSync(new URL('./data/wsmc-directory-2026.json', import.meta.url)));
const quote = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const sql = ['-- LOCAL ONLY: historical 2026 results replay; replaces all app data.',
 'PRAGMA foreign_keys = ON;', readFileSync(new URL('./reset-v2.sql', import.meta.url), 'utf8')];
const counts = {};
const add = (table, row) => {
 sql.push(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(quote).join(', ')});`);
 counts[table] = (counts[table] ?? 0) + 1;
};
const report = { schemaVersion: 1, scenario: '2026-results', seasonStatus: 'qualifications',
 policy: 'Preserve valid source data; report unresolved identities and score fields without inventing values.',
 sourceIssues: [], adjustments: [], omitted: [], incomplete: [], counts };
const note = (list, reason, region, school, entry, detail = {}) => report[list].push({ reason,
 regionNumber: region.regionNumber, school: school?.name ?? null, source: entry?.source ?? school?.sourceSheet ?? null,
 entryId: entry?.id ?? null, ...detail });
const seasonId = 'season-2026';
const admin = 'user-coordinator';
add('seasons', { id: seasonId, year: 2026, status: 'qualifications' });
add('users', { id: admin, email: 'coordinator@wsmc.example', display_name: '2026 replay administrator', status: 'active' });
add('statewide_assignments', { user_id: admin });
const seenRegions = new Set();
for (const source of manifest.regions) {
 const region = JSON.parse(readFileSync(new URL(source.file, base)));
 if (region.schemaVersion !== 1 || region.year !== 2026 || seenRegions.has(region.regionNumber)) throw new Error(`Invalid regional source: ${source.file}`);
 seenRegions.add(region.regionNumber);
 if (region.source.sha256 !== source.source.sha256) throw new Error(`Source manifest mismatch: ${source.file}`);
 const reviewed = reconciliation?.regions.find(r => r.regionNumber === region.regionNumber);
 if (reviewed) {
  if (reviewed.sourceSha256 !== region.source.sha256) throw new Error(`Stale reconciliation: ${source.file}`);
  for (const correction of reviewed.knowdown) {
   const outcome = region.knowdownResults.find(o => o.source === correction.source);
   const school = region.schools.find(s => s.id === correction.schoolId);
   if (!outcome || outcome.name !== correction.originalName || outcome.school !== correction.originalSchool ||
       !school?.students.some(s => s.id === correction.studentId)) throw new Error(`Invalid reconciliation: ${source.file}`);
   Object.assign(outcome, { studentId: correction.studentId, schoolId: correction.schoolId });
   note('adjustments', 'reviewed_knowdown_identity', region, school, outcome,
    { correction, reference: reconciliation.reference });
  }
 }
 report.sourceIssues.push(...region.issues.map(issue => ({ regionNumber: region.regionNumber, ...issue })));
 const n = region.regionNumber;
 const regionId = n === 11 ? 'region-virtual-2026' : `region-${n}-2026`;
 const contestId = n === 11 ? 'contest-virtual-2026' : `contest-region-${n}`;
 const name = directory.regions.find(r => r.number === n)?.name;
 if (!name) throw new Error(`Unknown region ${n}`);
 add('regions', { id: regionId, season_id: seasonId, number: n, name });
 add('contests', { id: contestId, season_id: seasonId, region_id: regionId, kind: 'regional',
  name: `${n === 11 ? 'Virtual' : `Region ${n} — ${name}`} Regional Contest`, lifecycle: 'finalized',
  starts_at: null, results_published_at: null });
 // Local fixture accounts only. Workbook contacts never become login identities.
 const regionalUser = `user-regional-${n}`;
 add('users', { id: regionalUser, email: `regional${n}@wsmc.example`, display_name: region.director.name ?? `${name} coordinator`, status: 'active' });
 add('regional_coordinator_assignments', { user_id: regionalUser, region_number: n });
 const schoolById = new Map();
 const importedEntries = new Map();
 const importedStudents = new Set();
 for (const school of region.schools) {
  if (!school.name) {
   note('omitted', 'unnamed_school', region, school, null, { studentRecords: school.studentRecords, entries: school.entries });
   continue;
  }
  schoolById.set(school.id, school);
  // Keep the workbook city/ZIP line together, rather than guessing components.
  add('schools', { id: school.id, name: school.name, short_name: school.name, division: school.division,
   address: school.address ?? '', city: school.cityZip ?? '', state: '', postal_code: '', contact_email: school.email ?? '' });
  const coach = `coach-${school.id}`;
  const coachEmail = `${coach.toLowerCase().replace(/[^a-z0-9-]/g, '-')}@wsmc.example`;
  add('users', { id: coach, email: coachEmail, display_name: school.coach ?? `${school.name} coach`, status: 'active' });
  add('coach_assignments', { user_id: coach, school_id: school.id });
  const participationId = `participation-${school.id}`;
  add('school_participations', { id: participationId, contest_id: contestId, school_id: school.id, division: school.division, invitation_status: 'accepted' });
  for (const student of school.students) {
   add('annual_students', { id: student.id, season_id: seasonId, school_id: school.id, name: student.name, actual_grade: student.actualGrade });
   add('contest_roster_members', { contest_id: contestId, participation_id: participationId, annual_student_id: student.id });
   importedStudents.add(student.id);
  }
  const individualNumbers = new Map();
  for (const entry of school.entries) {
   if (entry.category === 'team_contest' && entry.level === 'jv') {
    note('omitted', 'jv_not_supported_separately', region, school, entry, { entry });
    continue;
   }
   const topical = entry.category.startsWith('topical');
   const raw = entry.result;
   if (entry.category === 'topical_individual' && raw.part1 === null && raw.part2 === null) {
    note('omitted', 'unscored_assumed_individual', region, school, entry);
    continue;
   }
   const team = ['project', 'team_contest', 'topical_team'].includes(entry.category);
   const number = team ? entry.entryNumber : (individualNumbers.get(entry.category) ?? 0) + 1;
   individualNumbers.set(entry.category, number);
   add('entries', { id: entry.id, contest_id: contestId, owner_school_id: school.id, category: entry.category,
    entry_kind: team ? 'team' : 'individual', entry_number: number, division: school.division });
   importedEntries.set(entry.id, { entry, school, members: [] });
   const members = new Set();
   for (const member of [...entry.members].sort((a, b) => b.competingGrade - a.competingGrade)) {
    if (!member.studentId || !importedStudents.has(member.studentId)) {
     note('incomplete', 'unresolved_member_identity', region, school, entry, { member,
      record: school.studentRecords.find(r => r.id === member.recordId) });
     continue;
    }
    if (members.has(member.studentId)) {
     note('adjustments', 'duplicate_play_up_membership', region, school, entry,
      { omittedRecord: member, retainedCompetingGrade: entry.members.filter(m => m.studentId === member.studentId).map(m => m.competingGrade).sort((a, b) => b - a)[0] });
     continue;
    }
    members.add(member.studentId);
    importedEntries.get(entry.id).members.push(member.studentId);
    add('entry_members', { entry_id: entry.id, annual_student_id: member.studentId, competing_grade: team ? member.competingGrade : null });
   }
   if (entry.category === 'knowdown') continue; // reconciled against Info below
   const result = { entry_id: entry.id, score: null, part1: null, part2: null, last_edited_by: admin };
   if (topical) {
    for (const field of ['part1', 'part2']) {
     const value = raw[field];
     if (value === null) continue;
     if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 75) result[field] = value;
     else note('incomplete', 'topical_part_out_of_range', region, school, entry, { field, value });
    }
    if (result.part1 !== null && result.part2 !== null) result.score = result.part1 + result.part2;
    else note('incomplete', 'incomplete_topical_result', region, school, entry, { sourceResult: raw });
   } else if (typeof raw.score === 'number' && Number.isFinite(raw.score) && raw.score >= 0) result.score = raw.score;
   else note('incomplete', 'missing_or_invalid_score', region, school, entry, { sourceResult: raw });
   add('results', result);
  }
 }
 const placed = new Set();
 const placedEntries = new Set();
 for (const outcome of region.knowdownResults) {
  if (!outcome.name || ['n/a', 'none', 'na'].includes(outcome.name.toLowerCase())) continue;
  if (!outcome.studentId || !importedStudents.has(outcome.studentId)) {
   note('incomplete', 'unresolved_knowdown_placement', region, null, outcome, { outcome });
   continue;
  }
  const school = schoolById.get(outcome.schoolId);
  let matched = [...importedEntries.values()].find(e => e.entry.category === 'knowdown' && e.members.includes(outcome.studentId));
  if (!matched) {
   const id = `knowdown-placement-${n}-${outcome.studentId}`;
   // An entered placement is explicit participation even if the marker was omitted.
   add('entries', { id, contest_id: contestId, owner_school_id: school.id, category: 'knowdown', entry_kind: 'individual',
    entry_number: 100 + (outcome.alternate ? 4 : outcome.placement), division: school.division });
   add('entry_members', { entry_id: id, annual_student_id: outcome.studentId, competing_grade: null });
   matched = { entry: { id }, school, members: [outcome.studentId] };
   note('adjustments', 'knowdown_participation_from_placement', region, school, matched.entry, { outcome });
  }
  if (placed.has(outcome.studentId)) throw new Error(`Duplicate Knowdown placement for ${outcome.studentId}`);
  placed.add(outcome.studentId);
  placedEntries.add(matched.entry.id);
  add('results', { entry_id: matched.entry.id, placement: outcome.alternate ? 4 : outcome.placement,
   knowdown_outcome: 'placed', last_edited_by: admin });
 }
 // Never guess elimination while an unresolved placement could belong to this entrant.
 const unresolvedPlacements = report.incomplete.some(i => i.regionNumber === n && i.reason === 'unresolved_knowdown_placement');
 for (const { entry, school, members } of importedEntries.values()) {
  if (entry.category !== 'knowdown' || placedEntries.has(entry.id)) continue;
  if (unresolvedPlacements || members.length !== 1) {
   note('incomplete', 'unknown_knowdown_outcome', region, school, entry);
  } else add('results', { entry_id: entry.id, knowdown_outcome: 'eliminated', last_edited_by: admin });
 }
 // Retain historical assignments, but surface violations of today's roster rules.
 const categoriesByStudent = new Map();
 for (const { entry, school, members } of importedEntries.values()) {
  const team = ['project', 'team_contest', 'topical_team'].includes(entry.category);
  if (team && members.length > 3) note('incomplete', 'team_too_large', region, school, entry, { memberCount: members.length });
  const grades = new Set();
  for (const id of members) {
   const grade = Math.max(...entry.members.filter(m => m.studentId === id).map(m => m.competingGrade));
   if (team && grades.has(grade)) note('incomplete', 'duplicate_competing_grade', region, school, entry, { studentId: id, competingGrade: grade });
   grades.add(grade);
   const categories = categoriesByStudent.get(id) ?? new Set();
   if (categories.has(entry.category)) note('incomplete', 'duplicate_category_membership', region, school, entry, { studentId: id });
   if ((entry.category === 'topical_team' && categories.has('topical_individual')) ||
       (entry.category === 'topical_individual' && categories.has('topical_team'))) {
    note('incomplete', 'topical_exclusivity', region, school, entry, { studentId: id });
   }
   categories.add(entry.category);
   categoriesByStudent.set(id, categories);
  }
 }
 // Preserve original contacts, unresolved inputs, and all source issues in the audit trail.
 add('audit_events', { id: `seed-source-${n}`, actor_user_id: admin, contest_id: contestId,
  entity_type: 'import', entity_id: `regional-workbook-${n}`, action: 'historical_results_seeded',
  details_json: JSON.stringify({ source: region.source, director: region.director,
   contacts: region.schools.map(s => ({ id: s.id, name: s.name, coach: s.coach, email: s.email, phone: s.phone, fax: s.fax })),
   sourceIssues: region.issues, incomplete: report.incomplete.filter(i => i.regionNumber === n),
   omitted: report.omitted.filter(i => i.regionNumber === n) }) });
}
// Store the example's editable values as a draft, rather than UI-only defaults.
add('qualification_rounds', { id: 'round-cutoff-draft-2026', season_id: seasonId, kind: 'state_cutoff', status: 'draft',
 thresholds_json: JSON.stringify({ project: { 1: 0, 2: 0 }, team_contest: { 1: 14, 2: 10 }, topical_team: { 1: 89, 2: 68 }, topical_individual: { 1: 50, 2: 50 } }), created_by: admin });
if (seenRegions.size !== 11) throw new Error('Expected all 11 regional workbooks');
add('contests', { id: 'contest-state-2026', season_id: seasonId, region_id: null, kind: 'state', name: '2026 State Contest', lifecycle: 'setup', starts_at: null });
report.sqlSha256 = createHash('sha256').update(sql.join('\n') + '\n').digest('hex');
writeFileSync(output, sql.join('\n') + '\n');
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Generated 2026 results: ${counts.schools} schools, ${counts.annual_students} students, ${counts.entries} entries; ${report.incomplete.length} incomplete fields/records. Report: ${reportPath}`);
