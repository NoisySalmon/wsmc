<script lang="ts">
 import AdHocTeams from '$lib/components/AdHocTeams.svelte';
 import ContestSettings from '$lib/components/ContestSettings.svelte';
 import ContestStatus from '$lib/components/ContestStatus.svelte';
 import StateRegistration from '$lib/components/StateRegistration.svelte';
 let { data, form } = $props();
 const undecidedCount = $derived(data.qualifiedSchools.filter(school => {
  const attendance = data.attendance.find(a => a.schoolId === school.schoolId);
  return (!attendance || attendance.intent === 'undecided') && !data.participations.some(p => p.participation.schoolId === school.schoolId && p.participation.withdrawnAt != null);
 }).length);
 const schoolGroups = $derived.by(() => {
  const groups = new Map<string, { id: string; number: number | null; name: string | null; schools: typeof data.qualifiedSchools }>();
  for (const school of data.qualifiedSchools) {
   const id = school.regionId ?? 'unassigned';
   const group = groups.get(id) ?? { id, number: school.regionNumber, name: school.regionName, schools: [] };
   group.schools.push(school); groups.set(id, group);
  }
  return [...groups.values()].sort((a,b) => (a.number ?? Infinity) - (b.number ?? Infinity)).map(group => ({ ...group, schools: [...group.schools].sort((a,b) => a.schoolName.localeCompare(b.schoolName)) }));
 });
</script>
<svelte:head><title>{data.registration?.school.schoolName ?? data.contest.name} · State registration — WSMC</title></svelte:head>
{#if data.registration}
 <StateRegistration registration={data.registration} {form} isCoordinator={data.isCoordinator} adHoc={data.adHoc} />
{:else}
 <main>
  <a href="/">← Home</a><h1>{data.contest.name}</h1>
  <p>State registration · <ContestStatus status={data.contest.lifecycle} /></p>
  <ContestSettings contest={data.contest} canManage={data.canManageContest} />
  {#if form?.success}<p role="status">{form.success}</p>{/if}
  {#if form?.error}<p role="alert">{form.error}</p>{/if}
  <p>Open a school’s worksheet to review qualifiers, attendance, event choices, and substitutes.</p>
  <p><a href="/state/{data.contest.id}/csv">Download state roster CSV</a>{#if ['scoring', 'finalized'].includes(data.contest.lifecycle)} · <a href="/scoring/{data.contest.id}">State scoring</a>{/if}{#if data.contest.resultsPublishedAt} · <a href="/state/{data.contest.id}/results">Published results</a>{/if}</p>
  {#if data.isCoordinator && data.seasonStatus === 'state' && data.contest.lifecycle === 'registration_open'}
   <section class="bulk-attendance" aria-labelledby="bulk-heading">
    <h2 id="bulk-heading">Attendance undecided · {undecidedCount} schools</h2>
    <p>Opt in saves each school’s current worksheet, including its default qualifiers and events. Opt out marks its students not attending. Schools with a decided attendance status are left as they are.</p>
    <form method="POST" action="?/bulkAttendance">
     <button name="intent" value="attending" disabled={!undecidedCount}>Opt in all undecided schools</button>
     <button name="intent" value="not_attending" disabled={!undecidedCount}>Opt out all undecided schools</button>
    </form>
   </section>
  {/if}
  <section aria-label="Qualified schools">{#each schoolGroups as group}
   <section class="region-group" aria-labelledby={`region-${group.id}`}>
    <h2 id={`region-${group.id}`}>{group.number != null ? `Region ${group.number} — ${group.name}` : 'Region unavailable'} <span>{group.schools.length} {group.schools.length === 1 ? 'school' : 'schools'}</span></h2>
    {#each group.schools as school}<article><div><strong>{school.schoolName}</strong><small>Division {school.division} · {data.attendance.find(a => a.schoolId === school.schoolId)?.intent.replaceAll('_', ' ') ?? 'Attendance undecided'}</small></div><a href="/state/{data.contest.id}?schoolId={school.schoolId}#roster">Open state registration →</a></article>{/each}
   </section>
  {/each}</section>
  <AdHocTeams pools={data.adHoc} lifecycle={data.contest.lifecycle} canRegenerate={data.isCoordinator && data.seasonStatus === 'state'} />
 </main>
{/if}
<style>
 .bulk-attendance{padding:1rem;border:1px solid #dce1e8;border-radius:6px;margin-top:1.5rem}.bulk-attendance h2{font-size:1.1rem;margin:0}.bulk-attendance form{display:flex;flex-wrap:wrap;gap:.75rem}.bulk-attendance button{padding:.65rem .9rem;cursor:pointer}.bulk-attendance button:disabled{cursor:default}
 .region-group{margin-top:2rem}.region-group h2{font-size:1.1rem;padding:.8rem 1rem;background:#f3f5f8;border-radius:6px;margin:0}.region-group h2 span{font-size:.85rem;color:#596273;font-weight:400;margin-left:.75rem}
 main{max-width:1000px;margin:auto;padding:2rem 1rem} article{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:1rem;border-bottom:1px solid #dce1e8} small{display:block;color:#596273;margin-top:.4rem} a{color:#315ba6} @media(max-width:600px){article{align-items:start;flex-direction:column}}
</style>
