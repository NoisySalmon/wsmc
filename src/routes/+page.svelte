<script lang="ts">
	let { data } = $props();
	type ContestRow = { id: string; seasonId: string; regionId: string | null; name: string; kind: string; lifecycle: string };
	type RegionRow = { id: string; seasonId: string; number: number; name: string };
	type SeasonRow = { id: string; year: number; name: string; status: string };
	const isSystem = $derived(((data.principal?.statewideSeasonIds ?? []) as (string | null)[]).includes(null));
	const isSeasonCoordinator = $derived(((data.principal?.statewideSeasonIds ?? []) as (string | null)[]).length > 0);
	const isCoach = $derived((data.principal?.coachAssignments ?? []).length > 0);
	function stateContestFor(seasonId: string): ContestRow | undefined { return (data.contests as ContestRow[]).find((c) => c.seasonId === seasonId && c.kind === 'state'); }
	function regionalContestsFor(seasonId: string): (ContestRow & { region: RegionRow | null })[] {
		const regionById = new Map((data.regions as RegionRow[]).map((r) => [r.id, r]));
		return (data.contests as ContestRow[])
			.filter((c) => c.seasonId === seasonId && c.kind === 'regional')
			.map((c) => ({ ...c, region: c.regionId ? (regionById.get(c.regionId) ?? null) : null }))
			.sort((a, b) => (a.region?.number ?? 99) - (b.region?.number ?? 99));
	}
</script>

<svelte:head><title>WSMC</title></svelte:head>

<main>
	<h1>Washington State Mathematics Council</h1>
	{#if data.principal}
		<p>Welcome back, {data.principal.displayName || data.principal.email}.</p>
		{#if isCoach && !isSeasonCoordinator && !isSystem}
			<p>Start with <a href="/my-schools">My schools</a> to manage your roster.</p>
		{/if}
		{#if (data.seasons as SeasonRow[]).length}
			<h2>Seasons</h2>
			{#each data.seasons as season (season.id)}
				{@const stateContest = stateContestFor(season.id)}
				<section class="card">
					<div class="card-head"><h3>{season.year} — {season.name}</h3><span class="status">{season.status}</span></div>
					{#if isSeasonCoordinator || isSystem}
						<p><a href="/program">Set up regions + state contest</a> · <a href="/reports/season/{season.id}">Statewide reports</a> · <a href="/qualifications/{season.id}">Qualifications</a></p>
					{/if}
					<h4>Regions</h4>
					<ul>
					{#each regionalContestsFor(season.id) as contest (contest.id)}
						<li><a href="/contests/{contest.id}">{contest.region ? `Region ${contest.region.number}${contest.region.name ? ` — ${contest.region.name}` : ''}` : contest.name}</a> <span>· {contest.lifecycle}</span></li>
					{/each}
					</ul>
					{#if stateContest}<p><a href="/state/{stateContest.id}">Open state contest</a> <span>· {stateContest.lifecycle}</span></p>{/if}
				</section>
			{/each}
		{:else if isCoach}
			<p>Your account is active, but no responsibilities are assigned yet. Ask a WSMC coordinator to grant access.</p>
		{:else}
			<p>No seasons are available yet.</p>
		{/if}
	{:else}
		<p><a href="/login">Sign in</a> to continue.</p>
	{/if}
</main>

<style>
	main { max-width: 800px; margin: 0 auto; padding: 2rem; }
	.card { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; margin: 1rem 0; }
	.card-head { display: flex; gap: 0.7rem; align-items: baseline; }
	.card-head h3 { margin: 0; }
	.status { background: #eee; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem; }
	ul { padding-left: 1.2rem; }
	li span { color: #666; }
</style>
