import { isAdHocEntry } from '$lib/ad-hoc';
import { canCoachSchool, canCoordinateState, type Principal } from '$lib/server/auth/capabilities';
import { and, eq, inArray } from 'drizzle-orm';
import { schema, type Database } from '$lib/server/db';
import { getStateDashboard, StateError } from './service';

import { adHocEvents, defaultStateAdHoc, stateEvents, type StateRow, type StateEvent, type NewStateStudent } from '$lib/state-registration';
export type { StateRow, StateEvent, NewStateStudent } from '$lib/state-registration';

type StateDashboard = Awaited<ReturnType<typeof getStateDashboard>>;

export async function getStateWorksheet(db: Database, contestId: string, schoolId: string, cachedDashboard?: StateDashboard) {
 const dashboard = cachedDashboard ?? await getStateDashboard(db, contestId);
 const school = dashboard.qualifiedSchools.find(s => s.schoolId === schoolId);
 if (!school) throw new StateError('school_not_qualified', 'This school has no published state qualifications.');
 const qualifications = [...new Map(dashboard.stateQualifications.filter(q => q.schoolId === schoolId).map(q => [q.entryId, q])).values()];
 const sourceIds = qualifications.map(q => q.entryId);
 const originals = sourceIds.length ? await db.select({ member: schema.entryMembers, entry: schema.entries }).from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).where(inArray(schema.entryMembers.entryId, sourceIds)) : [];
 const options = qualifications.map(q => {
  const berth = dashboard.teamBerths.find(b => b.qualification.entryId === q.entryId);
  const members = originals.filter(m => m.member.entryId === q.entryId);
  return { id: q.id, sourceEntryId: q.entryId, category: q.category as StateEvent, studentId: q.studentId, team: Boolean(berth), number: berth?.entryNumber ?? null, berth: berth?.berth ?? null,
   originalIds: members.map(m => m.member.annualStudentId), originalGrades: Object.fromEntries(members.map(m => [m.member.annualStudentId, m.member.competingGrade])) };
 });
 const students = dashboard.students.filter(s => s.schoolId === schoolId).sort((a,b) => a.name.localeCompare(b.name));
 const [saved] = await db.select().from(schema.stateWorksheets).where(and(eq(schema.stateWorksheets.contestId, contestId), eq(schema.stateWorksheets.schoolId, schoolId)));
 const stored: StateRow[] = saved ? JSON.parse(saved.rowsJson) : [];
 const existingEntries = dashboard.entries.filter(e => e.ownerSchoolId === schoolId);
 const rows = students.map(student => {
  const individualQualified = options.some(option => option.category === 'topical_individual' && option.studentId === student.id);
  const previous = stored.find(r => r.id === student.id);
  if (previous) {
   // Blank slots in older saved worksheets are existing coach choices.
   return { ...previous, events: { ...previous.events, topical_team: individualQualified ? '' : previous.events.topical_team }, adHocOptOuts: previous.adHocOptOuts ?? adHocEvents.filter(category => !previous.events[category] && !(category === 'topical_team' && previous.events.topical_individual)) };
  }
  const events = Object.fromEntries(stateEvents.map(category => {
   const eligible = options.filter(o => o.category === category && (o.studentId === student.id || (o.team && o.originalIds.includes(student.id))));
   const existing = dashboard.members.find(m => m.student.id === student.id && existingEntries.some(e => e.id === m.member.entryId && e.category === category));
   const option = existing ? options.find(o => o.category === category && (o.berth?.stateEntryId === existing.member.entryId || o.studentId === student.id)) : eligible[0];
   return [category, option?.id ?? ''];
  })) as StateRow['events'];
  const grades = Object.fromEntries(stateEvents.map(category => {
   const o = options.find(o => o.id === events[category]);
   const existing = dashboard.members.find(m => m.student.id === student.id && existingEntries.some(e => e.id === m.member.entryId && e.category === category));
   return [category, existing?.member.competingGrade ?? o?.originalGrades[student.id] ?? student.actualGrade];
  })) as StateRow['grades'];
  if (individualQualified) events.topical_team = '';
  const row: StateRow = { id: student.id, attending: Object.values(events).some(Boolean), events, grades, adHocOptOuts: [] };
  return dashboard.seasonStatus === 'state' && dashboard.contest.lifecycle === 'registration_open' ? defaultStateAdHoc(row, true, individualQualified) : row;
 });
 const needsTrackUpdate = stored.some(row => row.events.topical_team && options.some(option => option.category === 'topical_individual' && option.studentId === row.id));
 const withdrawn = dashboard.participations.some(item => item.participation.schoolId === schoolId && item.participation.withdrawnAt != null);
 return { school, students, options, rows, withdrawn, needsTrackUpdate, saved: Boolean(saved), updatedAt: saved?.updatedAt ?? null, contest: dashboard.contest, seasonStatus: dashboard.seasonStatus };
}

type WorksheetInput = { contestId: string; schoolId: string; rows: StateRow[]; newStudents?: NewStateStudent[]; actorUserId: string };

export async function saveStateWorksheet(db: Database, input: WorksheetInput, dashboard?: StateDashboard) {
 return persistStateWorksheet(db, input, false, false, dashboard);
}

async function persistStateWorksheet(db: Database, input: WorksheetInput, resume = false, allowLocked = false, dashboard?: StateDashboard) {
 const sheet = await getStateWorksheet(db, input.contestId, input.schoolId, dashboard);
 if (sheet.seasonStatus !== 'state' || (sheet.contest.lifecycle !== 'registration_open' && !(allowLocked && sheet.contest.lifecycle === 'roster_locked'))) throw new StateError('locked', 'State registration is closed.');
 if (sheet.withdrawn && !resume) throw new StateError('withdrawn', 'Resume school registration before editing the worksheet.');
 const additions = input.newStudents ?? [];
 if (!Array.isArray(additions) || additions.length > 50 || additions.some(s => !s || typeof s.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(s.id) || sheet.students.some(existing => existing.id === s.id) || typeof s.name !== 'string' || !s.name.trim() || s.name.trim().length > 150 || ![9,10,11,12].includes(s.actualGrade)) || new Set(additions.map(s => s.id)).size !== additions.length) throw new StateError('invalid_student', 'Enter a name and grade 9–12 for each new substitute.');
 const students = [...sheet.students, ...additions];
 const rows = input.rows;
 if (!Array.isArray(rows) || rows.length !== students.length || new Set(rows.map(r => r.id)).size !== rows.length || rows.some(r => !students.some(s => s.id === r.id) || typeof r.attending !== 'boolean' || !r.events || !r.grades)) throw new StateError('invalid_rows', 'Reload the school roster before saving.');
 for (const row of rows) {
  row.adHocOptOuts = adHocEvents.filter(category => row.adHocOptOuts?.includes(category) || (row.attending && !row.events[category] && !(category === 'topical_team' && row.events.topical_individual)));
  row.events.project = sheet.options.find(o => o.category === 'project' && (o.studentId === row.id || o.originalIds.includes(row.id)))?.id ?? '';
 }
 const groups = sheet.options.map(option => ({ option, rows: rows.filter(r => r.attending && r.events[option.category] === option.id) }));
 for (const row of rows) {
  const student = students.find(s => s.id === row.id)!;
  if (row.attending && row.events.topical_team && sheet.options.some(option => option.category === 'topical_individual' && option.studentId === row.id)) throw new StateError('individual_track_reserved', `${student.name} qualified for Topical Individual and cannot switch to Topical Team, including Ad Hoc.`);
  for (const category of stateEvents) {
   const value = row.events[category];
   if (typeof value !== 'string') throw new StateError('invalid_event', 'Choose a valid event.');
   if (!row.attending || !value) continue;
   if ((category === 'team_contest' || category === 'topical_team') && value === 'ad_hoc') continue;
   const option = sheet.options.find(o => o.id === value && o.category === category);
   if (!option || (!option.team && option.studentId !== row.id)) throw new StateError('not_qualified', `${student.name} does not hold that individual qualification.`);
   if (option.team && category !== 'project' && (!Number.isInteger(row.grades[category]) || row.grades[category] < student.actualGrade || row.grades[category] > 12)) throw new StateError('invalid_grade', `${student.name}: choose a competing grade from their actual grade through grade 12.`);
  }
  const qualified = sheet.options.some(option => option.studentId === row.id || (option.team && option.originalIds.includes(row.id)));
  const qualifyingTeam = sheet.options.some(option => option.team && option.category !== 'project' && row.events[option.category] === option.id);
  if (row.attending && !qualified && !qualifyingTeam && stateEvents.some(category => row.events[category])) throw new StateError('substitute_team_required', `${student.name}: substitutes must join a qualified team. Ad Hoc alone does not provide admission to State.`);
  if (row.attending && !stateEvents.some(category => row.events[category])) throw new StateError('participation_required', `${student.name}: choose at least one event or Ad Hoc, or mark Not attending.`);
  if (row.attending && row.events.topical_team && row.events.topical_individual) throw new StateError('topical_conflict', `${student.name} must choose Topical Team or Individual.`);
 }
 for (const group of groups.filter(g => g.option.team && g.option.category !== 'project' && g.rows.length)) {
  if (group.rows.length > 3) throw new StateError('team_size', 'A team can have at most three students.');
  if (new Set(group.rows.map(r => r.grades[group.option.category])).size !== group.rows.length) throw new StateError('duplicate_grade', 'Team members must compete in different grades.');
  if (!group.rows.some(r => group.option.originalIds.includes(r.id))) throw new StateError('original_member_required', 'Each participating team must retain at least one original regional team member. Withdraw the team by choosing No event for all its members.');
 }
 const oldEntries = await db.select().from(schema.entries).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId)));
 const oldIds = oldEntries.map(e => e.id);
 if (oldIds.length && (await db.select().from(schema.results).where(inArray(schema.results.entryId, oldIds))).length) throw new StateError('scored', 'Scored entries cannot be replaced from registration.');
 const external = await db.select().from(schema.entryMembers).innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId)).innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.entryMembers.annualStudentId)).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.annualStudents.schoolId, input.schoolId)));
 if (external.some(e => e.entries.ownerSchoolId !== input.schoolId && !isAdHocEntry(e.entries))) throw new StateError('mixed_team', 'Contact the state coordinator to update existing cross-school entries before saving this worksheet.');
 const now = Date.now();
 const active = groups.filter(g => g.rows.length).map(g => ({ ...g, entryId: g.option.berth?.stateEntryId ?? crypto.randomUUID() }));
 const operations: any[] = [];
 for (const { entries: entry, entry_members: member } of external) {
  if (isAdHocEntry(entry) && !rows.some(r => r.id === member.annualStudentId && r.attending && r.events[entry.category as StateEvent] === 'ad_hoc')) {
   operations.push(db.delete(schema.entryMembers).where(and(eq(schema.entryMembers.entryId, entry.id), eq(schema.entryMembers.annualStudentId, member.annualStudentId))));
  }
 }
 for (const student of additions) operations.push(db.insert(schema.annualStudents).values({ id: student.id, name: student.name.trim(), actualGrade: student.actualGrade, seasonId: sheet.contest.seasonId, schoolId: input.schoolId, createdAt: now, updatedAt: now }));
 operations.push(db.delete(schema.stateAdHocSignups).where(and(eq(schema.stateAdHocSignups.contestId, input.contestId), eq(schema.stateAdHocSignups.schoolId, input.schoolId))));
 operations.push(db.delete(schema.stateRosterMembers).where(and(eq(schema.stateRosterMembers.contestId, input.contestId), eq(schema.stateRosterMembers.schoolId, input.schoolId))));
 operations.push(db.insert(schema.schoolParticipations).values({ id: crypto.randomUUID(), contestId: input.contestId, schoolId: input.schoolId, division: sheet.school.division }).onConflictDoNothing());
 if (resume) operations.push(db.update(schema.schoolParticipations).set({ withdrawnAt: null, updatedAt: now }).where(and(eq(schema.schoolParticipations.contestId, input.contestId), eq(schema.schoolParticipations.schoolId, input.schoolId))));
 operations.push(db.insert(schema.stateAttendances).values({ contestId: input.contestId, schoolId: input.schoolId, intent: rows.some(r => r.attending) ? 'attending' : 'not_attending', updatedBy: input.actorUserId, updatedAt: now }).onConflictDoUpdate({ target: [schema.stateAttendances.contestId, schema.stateAttendances.schoolId], set: { intent: rows.some(r => r.attending) ? 'attending' : 'not_attending', updatedBy: input.actorUserId, updatedAt: now } }));
 if (oldIds.length) operations.push(db.delete(schema.entries).where(inArray(schema.entries.id, oldIds)));
 for (const group of active) {
  operations.push(db.insert(schema.entries).values({ id: group.entryId, contestId: input.contestId, ownerSchoolId: input.schoolId, category: group.option.category, entryKind: group.option.team ? 'team' : 'individual', entryNumber: group.option.team ? group.option.number : null, division: sheet.school.division, createdAt: now, updatedAt: now }));
  if (group.option.berth) operations.push(db.insert(schema.stateTeamBerths).values({ ...group.option.berth, stateEntryId: group.entryId }).onConflictDoUpdate({ target: schema.stateTeamBerths.qualificationId, set: { stateEntryId: group.entryId } }));
  for (const row of group.rows) operations.push(db.insert(schema.entryMembers).values({ entryId: group.entryId, annualStudentId: row.id, competingGrade: group.option.category === 'project' ? group.option.originalGrades[row.id] ?? null : group.option.team ? row.grades[group.option.category] : null }));
 }
 for (const row of rows.filter(r => r.attending)) {
  const adHocEvents = (['team_contest', 'topical_team'] as const).filter(category => row.events[category] === 'ad_hoc');
  const adHoc = adHocEvents.length > 0;
  for (const category of adHocEvents) operations.push(db.insert(schema.stateAdHocSignups).values({ contestId: input.contestId, schoolId: input.schoolId, annualStudentId: row.id, category, createdAt: now }));
  const admission = active.find(g => g.rows.some(r => r.id === row.id));
  if (admission) operations.push(db.insert(schema.stateRosterMembers).values({ contestId: input.contestId, schoolId: input.schoolId, annualStudentId: row.id, admissionBasis: admission.option.team ? 'team_berth' : 'individual_qualification', qualificationId: admission.option.team ? null : admission.option.id, stateEntryId: admission.option.team ? admission.entryId : null, createdAt: now }));
  else if (adHoc) operations.push(db.insert(schema.stateRosterMembers).values({ contestId: input.contestId, schoolId: input.schoolId, annualStudentId: row.id, admissionBasis: 'ad_hoc', createdAt: now }));
 }
 operations.push(db.insert(schema.stateWorksheets).values({ contestId: input.contestId, schoolId: input.schoolId, rowsJson: JSON.stringify(rows), updatedAt: now }).onConflictDoUpdate({ target: [schema.stateWorksheets.contestId, schema.stateWorksheets.schoolId], set: { rowsJson: JSON.stringify(rows), updatedAt: now } }));
 operations.push(db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, contestId: input.contestId, schoolId: input.schoolId, entityType: 'state_worksheet', entityId: `${input.contestId}:${input.schoolId}`, action: resume ? 'state_registration_resumed' : 'state_worksheet_saved', detailsJson: JSON.stringify({ attending: rows.filter(r => r.attending).length }), createdAt: now }));
 await db.batch(operations as [any, ...any[]]);
}

/** School-level attendance changes retain the last saved worksheet for resuming. */
export async function changeStateSchoolAttendance(db: Database, input: { contestId: string; schoolId: string; change: 'withdraw' | 'resume'; principal: Principal }) {
 const sheet = await getStateWorksheet(db, input.contestId, input.schoolId);
 const admin = canCoordinateState(input.principal, sheet.contest.seasonId);
 if (!admin && !canCoachSchool(input.principal, input.schoolId)) throw new StateError('forbidden', 'You cannot change this school registration.');
 if (sheet.seasonStatus !== 'state' || (sheet.contest.lifecycle !== 'registration_open' && !(admin && sheet.contest.lifecycle === 'roster_locked'))) throw new StateError('locked', 'School attendance changes require open registration. After rosters lock, contact an administrator before scoring starts.');
 if (input.change === 'resume') {
  if (!sheet.withdrawn) throw new StateError('not_withdrawn', 'This school has not withdrawn.');
  if (!sheet.saved) {
   const now = Date.now();
   // Returning to the qualification preview is not a confirmed registration.
   await db.batch([
    db.update(schema.schoolParticipations).set({ withdrawnAt: null, updatedAt: now }).where(and(eq(schema.schoolParticipations.contestId, input.contestId), eq(schema.schoolParticipations.schoolId, input.schoolId))),
    db.update(schema.stateAttendances).set({ intent: 'undecided', updatedBy: input.principal.id, updatedAt: now }).where(and(eq(schema.stateAttendances.contestId, input.contestId), eq(schema.stateAttendances.schoolId, input.schoolId))),
    db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.principal.id, contestId: input.contestId, schoolId: input.schoolId, entityType: 'state_worksheet', entityId: `${input.contestId}:${input.schoolId}`, action: 'state_registration_resumed', createdAt: now }),
   ]);
   return;
  }
  return persistStateWorksheet(db, { contestId: input.contestId, schoolId: input.schoolId, rows: sheet.rows, actorUserId: input.principal.id }, true, admin);
 }
 if (input.change !== 'withdraw') throw new StateError('invalid_change', 'Choose withdrawal or resume.');
 if (sheet.withdrawn) return;
 const ownedEntries = await db.select().from(schema.entries).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.ownerSchoolId, input.schoolId)));
 const memberships = await db.select({ member: schema.entryMembers }).from(schema.entryMembers)
  .innerJoin(schema.entries, eq(schema.entries.id, schema.entryMembers.entryId))
  .innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.entryMembers.annualStudentId))
  .where(and(eq(schema.entries.contestId, input.contestId), eq(schema.annualStudents.schoolId, input.schoolId)));
 const affectedIds = [...new Set([...ownedEntries.map(entry => entry.id), ...memberships.map(row => row.member.entryId)])];
 if (affectedIds.length && (await db.select().from(schema.results).where(inArray(schema.results.entryId, affectedIds))).length) throw new StateError('scored', 'Scored entries must be corrected through scoring before withdrawing a school.');
 const now = Date.now();
 const operations: any[] = [
  db.delete(schema.stateAdHocSignups).where(and(eq(schema.stateAdHocSignups.contestId, input.contestId), eq(schema.stateAdHocSignups.schoolId, input.schoolId))),
  db.delete(schema.stateRosterMembers).where(and(eq(schema.stateRosterMembers.contestId, input.contestId), eq(schema.stateRosterMembers.schoolId, input.schoolId))),
 ];
 for (const { member } of memberships) operations.push(db.delete(schema.entryMembers).where(and(eq(schema.entryMembers.entryId, member.entryId), eq(schema.entryMembers.annualStudentId, member.annualStudentId))));
 if (ownedEntries.length) operations.push(db.delete(schema.entries).where(inArray(schema.entries.id, ownedEntries.map(entry => entry.id))));
 operations.push(db.insert(schema.schoolParticipations).values({ id: crypto.randomUUID(), contestId: input.contestId, schoolId: input.schoolId, division: sheet.school.division, withdrawnAt: now, updatedAt: now }).onConflictDoUpdate({ target: [schema.schoolParticipations.contestId, schema.schoolParticipations.schoolId], set: { withdrawnAt: now, updatedAt: now } }));
 operations.push(db.insert(schema.stateAttendances).values({ contestId: input.contestId, schoolId: input.schoolId, intent: 'not_attending', updatedBy: input.principal.id, updatedAt: now }).onConflictDoUpdate({ target: [schema.stateAttendances.contestId, schema.stateAttendances.schoolId], set: { intent: 'not_attending', updatedBy: input.principal.id, updatedAt: now } }));
 operations.push(db.insert(schema.auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.principal.id, contestId: input.contestId, schoolId: input.schoolId, entityType: 'state_worksheet', entityId: `${input.contestId}:${input.schoolId}`, action: 'state_registration_withdrawn', createdAt: now }));
 await db.batch(operations as [any, ...any[]]);
}
