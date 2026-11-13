<script lang="ts">
 import ContestSettings from '$lib/components/ContestSettings.svelte';
 import ContestStatus from '$lib/components/ContestStatus.svelte';
 import StateRegistration from '$lib/components/StateRegistration.svelte';
 let { data, form } = $props();
</script>
<svelte:head><title>{data.registration?.school.schoolName ?? data.contest.name} · State registration — WSMC</title></svelte:head>
{#if data.registration}
 <StateRegistration registration={data.registration} {form} isCoordinator={data.isCoordinator} />
{:else}
 <main>
  <a href="/">← Home</a><h1>{data.contest.name}</h1>
  <p>State registration · <ContestStatus status={data.contest.lifecycle} /></p>
  <ContestSettings contest={data.contest} canManage={data.canManageContest} />
  {#if form?.error}<p role="alert">{form.error}</p>{/if}
  <p>Open a school’s worksheet to review qualifiers, attendance, event choices, and substitutes.</p>
  <p><a href="/state/{data.contest.id}/csv">Download state roster CSV</a>{#if ['scoring', 'finalized'].includes(data.contest.lifecycle)} · <a href="/scoring/{data.contest.id}">State scoring</a>{/if}{#if data.contest.resultsPublishedAt} · <a href="/state/{data.contest.id}/results">Published results</a>{/if}</p>
  <section aria-label="Qualified schools">{#each data.qualifiedSchools.toSorted((a,b) => a.schoolName.localeCompare(b.schoolName)) as school}
   <article><div><strong>{school.schoolName}</strong><small>Division {school.division} · {data.attendance.find(a => a.schoolId === school.schoolId)?.intent.replaceAll('_', ' ') ?? 'Attendance undecided'}</small></div><a href="/state/{data.contest.id}?schoolId={school.schoolId}#roster">Open state registration →</a></article>
  {/each}</section>
 </main>
{/if}
<style>
 main{max-width:1000px;margin:auto;padding:2rem 1rem} article{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:1rem;border-bottom:1px solid #dce1e8} small{display:block;color:#596273;margin-top:.4rem} a{color:#315ba6} @media(max-width:600px){article{align-items:start;flex-direction:column}}
</style>
