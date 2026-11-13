<script lang="ts">
 import { enhance } from '$app/forms';
 import { adHocLabels } from '$lib/ad-hoc';
 import type { getAdHocDashboard } from '$lib/server/state/ad-hoc';
 let { pools, lifecycle, canRegenerate = false, schoolView = false }: { pools: Awaited<ReturnType<typeof getAdHocDashboard>>; lifecycle: string; canRegenerate?: boolean; schoolView?: boolean } = $props();
 let saving = $state('');
 const tentative = $derived(lifecycle === 'registration_open' || pools.some(pool => pool.needsRegeneration));
</script>
<section class="ad-hoc" aria-labelledby="ad-hoc-heading" id="ad-hoc">
 <h2 id="ad-hoc-heading">Ad-hoc teams <span>{tentative ? 'Tentative' : 'Settled'}</span></h2>
 <p>{tentative ? 'Assignments are tentative while registration is open or staff is incorporating registration changes. Regeneration keeps existing teams together where possible.' : 'Registration is locked. These are the assigned teams.'} Team Problem and Topical assignments are independent.</p>
 {#if canRegenerate}<p>Teams have three students where possible, or two to avoid a team of one. Each student comes from a different school; mixed grades are preferred. Divisions are combined.</p>{/if}
 {#each pools as pool}
  <section class="pool" aria-label={adHocLabels[pool.category]}>
   <div class="heading"><div><h3>{adHocLabels[pool.category]}</h3><p>{pool.total} {schoolView ? 'students from your school' : 'students signed up'} · {pool.teams.length} teams{#if pool.unassigned.length}<span> · </span><strong>{pool.unassigned.length} unassigned</strong>{/if}</p></div>
   {#if canRegenerate && ['registration_open', 'roster_locked'].includes(lifecycle)}
    <form method="POST" action="?/regenerateAdHoc" use:enhance={() => { saving = pool.category; return async ({ update }) => { await update({ reset: false }); saving = ''; }; }}>
     <input type="hidden" name="category" value={pool.category} /><button disabled={Boolean(saving)}>{saving === pool.category ? 'Building…' : pool.teams.length ? 'Regenerate teams' : 'Build teams'}</button>
    </form>
   {/if}</div>
   {#if pool.needsRegeneration}<p class="notice">{canRegenerate ? 'Assignments need attention. Regenerate to include registration changes and rebalance incomplete teams.' : 'Staff is completing assignments. Registration changes may affect these teams.'}</p>{/if}
   <div class="teams">{#each pool.teams as team (team.id)}<article><h4>Team {team.number}</h4><ul>{#each team.members as student}<li><strong>{student.name}</strong><small>{student.schoolName} · Grade {student.actualGrade}</small></li>{/each}</ul>{#if team.members.length < 2}<p class="notice">Awaiting regeneration</p>{/if}</article>{/each}</div>
   {#if pool.unassigned.length}<details open={schoolView}><summary>Awaiting assignment · {pool.unassigned.length}</summary><ul>{#each pool.unassigned as student}<li>{student.name} — {student.schoolName}, grade {student.actualGrade}</li>{/each}</ul><p>Staff can regenerate teams. If there are too few students from different schools to form pairs, these students remain unassigned.</p></details>{:else if !pool.teams.length}<p>No ad-hoc signups yet.</p>{/if}
  </section>
 {/each}
</section>
<style>
 .ad-hoc{margin-top:2rem;border-top:1px solid #dce1e8;padding-top:1.25rem}h2{font-size:1.3rem}h2 span{font-size:.8rem;font-weight:500;background:#edf2fa;padding:.3rem .6rem;border-radius:1rem;vertical-align:middle}h3,h4{margin:0}.pool{padding:1rem;border:1px solid #dce1e8;border-radius:6px;margin-top:1rem}.heading{display:flex;justify-content:space-between;gap:1rem;align-items:center}.heading p{margin-bottom:0;color:#596273}.teams{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.75rem;margin-top:1rem}article{background:#f5f7fa;border-radius:4px;padding:1rem}ul{padding-left:1.2rem}li{margin:.6rem 0}small{display:block;color:#596273;margin-top:.2rem}.notice{color:#805717;background:#fff6df;padding:.65rem;border-radius:4px}button{background:#203d66;color:white;border:0;border-radius:4px;padding:.7rem 1rem;font:inherit;cursor:pointer}button:disabled{opacity:.6;cursor:wait}details{margin-top:1rem}summary{font-weight:600;cursor:pointer}@media(max-width:600px){.heading{align-items:start;flex-direction:column}}
</style>
