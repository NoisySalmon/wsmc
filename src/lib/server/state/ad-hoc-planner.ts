export type AdHocStudent = { id: string; schoolId: string; actualGrade: number };
export type AdHocTeam = { id: string; number: number; members: string[] };

/** A school-to-team capacity matching keeps school separation a hard constraint. */
function pack(students: AdHocStudent[], teams: AdHocStudent[][], sizes: number[]): AdHocStudent[][] | null {
 const schools = [...new Set(students.map(s => s.schoolId))];
 for (let i = schools.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [schools[i], schools[j]] = [schools[j], schools[i]];
 }
 const source = 0, firstTeam = schools.length + 1, sink = firstTeam + teams.length;
 const capacity = Array.from({ length: sink + 1 }, () => Array<number>(sink + 1).fill(0));
 schools.forEach((school, i) => {
  capacity[source][i + 1] = students.filter(s => s.schoolId === school).length;
  teams.forEach((team, j) => { if (!team.some(s => s.schoolId === school)) capacity[i + 1][firstTeam + j] = 1; });
 });
 teams.forEach((team, j) => { capacity[firstTeam + j][sink] = sizes[j] - team.length; });
 const residual = capacity.map(row => [...row]);
 let flow = 0;
 while (true) {
  const parent = Array<number>(sink + 1).fill(-1), queue = [source]; parent[source] = source;
  for (let q = 0; q < queue.length && parent[sink] < 0; q++) {
   for (let v = 1; v <= sink; v++) if (parent[v] < 0 && residual[queue[q]][v] > 0) { parent[v] = queue[q]; queue.push(v); }
  }
  if (parent[sink] < 0) break;
  for (let v = sink; v !== source; v = parent[v]) { residual[parent[v]][v]--; residual[v][parent[v]]++; }
  flow++;
 }
 if (flow !== students.length) return null;
 const output = teams.map(team => [...team]);
 schools.forEach((school, i) => {
  const remaining = students.filter(s => s.schoolId === school);
  const destinations = teams.map((_, j) => j).filter(j => capacity[i + 1][firstTeam + j] === 1 && residual[i + 1][firstTeam + j] === 0);
  // Put scarce grade choices first, then prefer a grade absent from this team.
  destinations.sort((a,b) => output[b].length - output[a].length);
  for (const j of destinations) {
   const index = remaining.findIndex(s => !output[j].some(m => m.actualGrade === s.actualGrade));
   output[j].push(remaining.splice(index < 0 ? 0 : index, 1)[0]);
  }
 });
 return output;
}

/** Preserve complete teams whenever the remaining pool can still form pairs/triples. */
export function planAdHocTeams(pool: AdHocStudent[], previous: AdHocTeam[]) {
 const byId = new Map(pool.map(s => [s.id, s]));
 const prior = [...previous].sort((a,b) => b.members.length - a.members.length || a.number - b.number);
 let eligible = [...pool];
 const unassigned: AdHocStudent[] = [];
 const dominant = [...new Set(pool.map(s => s.schoolId))].map(schoolId => ({ schoolId, count: pool.filter(s => s.schoolId === schoolId).length })).sort((a,b) => b.count - a.count)[0];
 if (dominant && dominant.count > pool.length - dominant.count) {
  const excess = 2 * dominant.count - pool.length;
  // Keep existing placements first when school imbalance makes full assignment impossible.
  const assigned = new Set(previous.flatMap(t => t.members));
  const candidates = pool.filter(s => s.schoolId === dominant.schoolId).sort((a,b) => Number(assigned.has(a.id)) - Number(assigned.has(b.id)));
  unassigned.push(...candidates.slice(0, excess));
  const excluded = new Set(unassigned.map(s => s.id)); eligible = pool.filter(s => !excluded.has(s.id));
 }
 if (!eligible.length) return { teams: [] as AdHocTeam[], unassigned };
 const maxSchool = Math.max(...[...new Set(eligible.map(s => s.schoolId))].map(id => eligible.filter(s => s.schoolId === id).length));
 const count = Math.max(Math.ceil(eligible.length / 3), maxSchool);
 const triples = eligible.length - count * 2;
 const sizes = Array.from({ length: count }, (_, i) => i < triples ? 3 : 2);
 const fixed: AdHocStudent[][] = sizes.map(() => []);
 const identities: (AdHocTeam | undefined)[] = sizes.map(() => undefined);
 const available = new Set(eligible.map(s => s.id));
 for (const old of prior) {
  const members = old.members.filter(id => available.has(id)).map(id => byId.get(id)!);
  if (members.length < 2 || new Set(members.map(s => s.schoolId)).size !== members.length) continue;
  const slot = sizes.findIndex((size, i) => !identities[i] && size === members.length);
  if (slot < 0) continue;
  fixed[slot] = members;
  const reserved = new Set(fixed.flat().map(s => s.id));
  if (pack(eligible.filter(s => !reserved.has(s.id)), fixed, sizes)) {
   identities[slot] = old; members.forEach(s => available.delete(s.id));
  } else fixed[slot] = [];
 }
 const pending = eligible.filter(s => available.has(s.id));
 let best: AdHocStudent[][] | null = null, bestVariety = -1;
 for (let attempt = 0; attempt < 16; attempt++) {
  const result = pack(pending, fixed, sizes);
  if (!result) continue;
  const variety = result.reduce((sum, team) => sum + new Set(team.map(s => s.actualGrade)).size, 0);
  if (variety > bestVariety) { best = result; bestVariety = variety; }
 }
 if (!best) throw new Error('Could not construct ad-hoc teams.');
 const used = new Set(identities.filter(Boolean).map(t => t!.id));
 let nextNumber = Math.max(0, ...previous.map(t => t.number)) + 1;
 const teams = best.map((members, i) => {
  const old = identities[i] ?? prior.filter(t => !used.has(t.id)).sort((a,b) => b.members.filter(id => members.some(s => s.id === id)).length - a.members.filter(id => members.some(s => s.id === id)).length)[0];
  if (old) used.add(old.id);
  return { id: old?.id ?? crypto.randomUUID(), number: old?.number ?? nextNumber++, members: members.map(s => s.id) };
 });
 return { teams: teams.sort((a,b) => a.number - b.number), unassigned };
}
