import { and, eq, inArray } from 'drizzle-orm';
import { schema, type Database } from '$lib/server/db';
import { adHocCategories, isAdHocEntry, type AdHocCategory } from '$lib/ad-hoc';
import { planAdHocTeams } from './ad-hoc-planner';
import { StateError } from './service';

export async function getAdHocDashboard(db: Database, contestId: string, schoolId?: string) {
 const generations = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.contestId, contestId), eq(schema.auditEvents.action, 'ad_hoc_regenerated')));
 const signups = await db.select({ signup: schema.stateAdHocSignups, student: schema.annualStudents, schoolName: schema.schools.name }).from(schema.stateAdHocSignups)
  .innerJoin(schema.annualStudents, eq(schema.annualStudents.id, schema.stateAdHocSignups.annualStudentId))
  .innerJoin(schema.schools, eq(schema.schools.id, schema.stateAdHocSignups.schoolId))
  .innerJoin(schema.stateRosterMembers, and(eq(schema.stateRosterMembers.contestId, schema.stateAdHocSignups.contestId), eq(schema.stateRosterMembers.annualStudentId, schema.stateAdHocSignups.annualStudentId)))
  .where(eq(schema.stateAdHocSignups.contestId, contestId));
 const entries = (await db.select().from(schema.entries).where(eq(schema.entries.contestId, contestId))).filter(isAdHocEntry);
 const members = entries.length ? await db.select().from(schema.entryMembers).where(inArray(schema.entryMembers.entryId, entries.map(e => e.id))) : [];
 return adHocCategories.map(category => {
  const pool = signups.filter(s => s.signup.category === category).map(({ student, schoolName }) => ({ id: student.id, name: student.name, schoolId: student.schoolId, actualGrade: student.actualGrade, schoolName }));
  const teams = entries.filter(e => e.category === category).map(entry => ({ id: entry.id, number: entry.entryNumber ?? 0,
   members: members.filter(m => m.entryId === entry.id).flatMap(m => { const student = pool.find(s => s.id === m.annualStudentId); return student ? [student] : []; }) })).sort((a,b) => a.number - b.number);
  const assigned = new Set(teams.flatMap(t => t.members.map(s => s.id)));
  const unassigned = pool.filter(s => !assigned.has(s.id));
  const last = generations.filter(g => g.entityId === category).sort((a,b) => b.createdAt - a.createdAt)[0];
  const poolKey = JSON.stringify(pool.map(s => `${s.id}:${s.actualGrade}`).sort());
  const generatedPoolKey = last ? JSON.parse(last.detailsJson).poolKey : null;
  const needsRegeneration = (pool.length > 0 && poolKey !== generatedPoolKey) || teams.some(t => t.members.length < 2) || members.some(m => entries.some(e => e.id === m.entryId && e.category === category) && !pool.some(s => s.id === m.annualStudentId));
  return { category, generationId: last?.id ?? null, generatedAt: last?.createdAt ?? null, total: schoolId ? pool.filter(s => s.schoolId === schoolId).length : pool.length,
   teams: schoolId ? teams.filter(t => t.members.some(s => s.schoolId === schoolId)) : teams,
   unassigned: schoolId ? unassigned.filter(s => s.schoolId === schoolId) : unassigned, needsRegeneration };
 });
}

export async function regenerateAdHocTeams(db: Database, input: { contestId: string; category: AdHocCategory; actorUserId: string }) {
 if (!adHocCategories.includes(input.category)) throw new StateError('invalid_category', 'Choose Team Problem or Topical.');
 const [contest] = await db.select().from(schema.contests).where(eq(schema.contests.id, input.contestId));
 const [season] = contest ? await db.select().from(schema.seasons).where(eq(schema.seasons.id, contest.seasonId)) : [];
 if (!contest || contest.kind !== 'state') throw new StateError('not_found', 'State contest not found.');
 if (season?.status !== 'state' || !['registration_open', 'roster_locked'].includes(contest.lifecycle)) throw new StateError('locked', 'Ad-hoc teams can be regenerated during registration or rosters locked, before scoring starts.');
 const [pool] = (await getAdHocDashboard(db, input.contestId)).filter(p => p.category === input.category);
 const entries = (await db.select().from(schema.entries).where(and(eq(schema.entries.contestId, input.contestId), eq(schema.entries.category, input.category)))).filter(isAdHocEntry);
 const ids = entries.map(e => e.id);
 if (ids.length && (await db.select().from(schema.results).where(inArray(schema.results.entryId, ids))).length) throw new StateError('scored', 'Scored ad-hoc teams cannot be regenerated.');
 const students = [...pool.teams.flatMap(t => t.members), ...pool.unassigned];
 const plan = planAdHocTeams(students, pool.teams.map(t => ({ ...t, members: t.members.map(s => s.id) })));
 // Concurrent builders from the same snapshot share an audit ID. D1 rolls the
 // losing batch back instead of creating two sets of teams for the same pool.
 const signature = JSON.stringify([input.contestId, input.category, pool.generationId]);
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
 const generationId = `ad-hoc:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
 const now = Math.max(Date.now(), (pool.generatedAt ?? 0) + 1);
 const operations = [];
 if (ids.length) operations.push(db.delete(schema.entries).where(inArray(schema.entries.id, ids)));
 for (const team of plan.teams) {
  // Division is a storage placeholder. Ad-hoc entries always score/rank across divisions.
  operations.push(db.insert(schema.entries).values({ id: team.id, contestId: input.contestId, ownerSchoolId: null, category: input.category, entryKind: 'team', entryNumber: team.number, division: 1, createdAt: entries.find(e => e.id === team.id)?.createdAt ?? now, updatedAt: now }));
  for (const id of team.members) operations.push(db.insert(schema.entryMembers).values({ entryId: team.id, annualStudentId: id, competingGrade: students.find(s => s.id === id)!.actualGrade, createdAt: now }));
 }
 operations.push(db.insert(schema.auditEvents).values({ id: generationId, actorUserId: input.actorUserId, contestId: input.contestId, entityType: 'ad_hoc_teams', entityId: input.category, action: 'ad_hoc_regenerated', detailsJson: JSON.stringify({ poolKey: JSON.stringify(students.map(s => `${s.id}:${s.actualGrade}`).sort()), teams: plan.teams.length, unassigned: plan.unassigned.map(s => s.id) }), createdAt: now }));
 await db.batch(operations as [typeof operations[number], ...typeof operations[number][]]);
 return { teams: plan.teams.length, unassigned: plan.unassigned.length };
}
