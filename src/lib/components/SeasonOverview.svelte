<script lang="ts">
	import ContestStatus from '$lib/components/ContestStatus.svelte';
	import { contestDate } from '$lib/contest-date';
	import { seasonStages, seasonLabels, seasonDescriptions } from '$lib/season';
	let { season, contests, regions, canOpenQualifications = false, canOpenState = true } : {
		canOpenQualifications?: boolean;
		canOpenState?: boolean;
		season: { id: string; year: number; status: string };
		contests: { id: string; seasonId: string; regionId: string | null; kind: string; lifecycle: string; canOpen: boolean; startsAt: number | null }[];
		regions: { id: string; seasonId: string; number: number; name: string }[];
	} = $props();
	const regional = $derived(regions.filter(r => r.seasonId === season.id).sort((a,b) => a.number-b.number));
	const panels = $derived(season.status === 'regional' ? ['regional', 'qualifications', 'state'] : season.status === 'qualifications' ? ['qualifications', 'regional', 'state'] : ['state', 'qualifications', 'regional']);
	const state = $derived(contests.find(c => c.seasonId === season.id && c.kind === 'state'));
</script>
<header><h2>{season.year}</h2><span class="badge">{seasonLabels[season.status]}</span></header>
<ol aria-label="Season stages">
	{#each seasonStages as stage}<li aria-current={season.status === stage ? 'step' : undefined} class:current={season.status === stage}>{seasonLabels[stage]}</li>{/each}
</ol>
<p class="description">{seasonDescriptions[season.status]}</p>
{#each panels as panel}
	{#if panel === 'regional'}
		<section aria-label="Regional contests">
			<h3>Regional contests</h3>
			<ul class="contests">
				{#each regional as region}
					{@const contest = contests.find(c => c.regionId === region.id && c.kind === 'regional')}
					<li>{#if contest}{#if contest.canOpen}<a href="/contests/{contest.id}">Region {region.number} — {region.name}</a>{:else}<span>Region {region.number} — {region.name}</span>{/if}<ContestStatus status={contest.lifecycle} /><span class="date">{contestDate(contest.startsAt)}</span>{:else}<span>Region {region.number} — {region.name}</span><span>Contest unavailable</span>{/if}</li>
				{/each}
			</ul>
		</section>
	{:else if panel === 'qualifications' && canOpenQualifications}
		<section aria-label="State qualifications">
			<h3>State qualifications</h3><p><a href="/qualifications/{season.id}">Plan and review qualifications →</a></p>
		</section>
	{:else if panel === 'state'}
		<section aria-label="State contest">
			<h3>State contest</h3>
			{#if state}<div class="state">{#if canOpenState}<a href="/state/{state.id}">State contest</a>{:else}<span>State contest</span>{/if}<ContestStatus status={state.lifecycle} /><span class="date">{contestDate(state.startsAt)}</span></div>{:else}<p>State contest unavailable.</p>{/if}
		</section>
	{/if}
{/each}
<style>
	header { display:flex; align-items:center; flex-wrap:wrap; gap:.75rem; } h2 { margin:0; font-size:1.4rem; } h3 { margin:1.5rem 0 .5rem; font-size:1.05rem; }
	.badge { background:#edf1f7; border-radius:4px; padding:.3rem .55rem; font-size:.85rem; }
	ol { display:flex; flex-wrap:wrap; gap:.5rem 1.5rem; padding:0; list-style:none; margin:1.25rem 0 .75rem; color:#596273; font-size:.9rem; } ol li { padding-bottom:.4rem; border-bottom:3px solid #e5e7eb; } ol li.current { color:#182b55; font-weight:700; border-color:#315ba6; }
	.description { color:#596273; line-height:1.5; }
	.contests { list-style:none; padding:0; margin:0; } .contests li, .state { display:grid; grid-template-columns:minmax(0, 1fr) 10rem 11rem; align-items:baseline; gap:.5rem 1rem; padding:.8rem 0; border-bottom:1px solid #e5e7eb; } .contests span, .state span { color:#596273; font-size:.95rem; } a { line-height:1.5; }
	.date { text-align:right; white-space:nowrap; }
	@media(max-width:640px) { .contests li, .state { grid-template-columns:minmax(0,1fr) auto; gap:.5rem; } .contests li > :first-child, .state > :first-child { grid-column:1 / -1; } }
</style>
