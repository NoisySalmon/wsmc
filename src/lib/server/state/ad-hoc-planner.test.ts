import { describe, expect, it } from 'vitest';
import { planAdHocTeams, type AdHocStudent } from './ad-hoc-planner';

function students(counts: number[]): AdHocStudent[] {
 return counts.flatMap((count, school) => Array.from({ length: count }, (_, i) => ({ id: `${school}-${i}`, schoolId: String(school), actualGrade: 9 + (i + school) % 4 })));
}

describe('ad-hoc team construction', () => {
 it.each([[1,1,1,1], [3,3,1], [5,2,2], [4,4], [6,1], [1], []])('assigns every feasible student without singletons or school collisions: %j', (...counts) => {
  const pool = students(counts);
  const result = planAdHocTeams(pool, []);
  const ids = result.teams.flatMap(t => t.members);
  expect(new Set([...ids, ...result.unassigned.map(s => s.id)]).size).toBe(pool.length);
  expect(ids.length + result.unassigned.length).toBe(pool.length);
  for (const team of result.teams) {
   expect([2,3]).toContain(team.members.length);
   expect(new Set(team.members.map(id => pool.find(s => s.id === id)!.schoolId)).size).toBe(team.members.length);
  }
  expect(result.unassigned.length).toBe(Math.max(0, 2 * Math.max(0, ...counts) - pool.length));
  if (pool.length === 4) expect(result.teams.map(t => t.members.length)).toEqual([2,2]);
 });
 it('preserves team identities and memberships on repeat regeneration and after adding a complete team', () => {
  const pool = students([2,2,2]);
  const original = planAdHocTeams(pool, []).teams;
  const repeat = planAdHocTeams(pool, original).teams;
  expect(repeat).toEqual(original);
  const added = students([3,3,3]);
  const extended = planAdHocTeams(added, original);
  for (const team of original) expect(extended.teams).toContainEqual(team);
 });
 it('rebalances a withdrawal into pairs while retaining an unaffected team', () => {
  const pool = students([3,3,3]);
  const original = planAdHocTeams(pool, []).teams;
  const removed = new Set(original[0].members.slice(0,2));
  const result = planAdHocTeams(pool.filter(s => !removed.has(s.id)), original);
  expect(result.teams.some(t => t.id === original[1].id && t.members.join() === original[1].members.join())).toBe(true);
  expect(result.teams.map(t => t.members.length).sort()).toEqual([2,2,3]);
  expect(result.unassigned).toEqual([]);
 });
 it('prefers varied actual grades, but accepts a same-grade pool', () => {
  const varied = students([1,1,1]);
  const teams = planAdHocTeams(varied, []).teams;
  expect(teams.reduce((sum,t) => sum + new Set(t.members.map(id => varied.find(s => s.id === id)!.actualGrade)).size, 0)).toBe(3);
  expect(planAdHocTeams(varied.map(s => ({ ...s, actualGrade: 12 })), []).unassigned).toEqual([]);
 });
});
