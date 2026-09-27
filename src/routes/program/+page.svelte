<script lang="ts">
	let { data, form } = $props();
	const lifecycleOptions = ['setup', 'registration_open', 'roster_locked', 'scoring'];
	function readinessFor(seasonId: string) { return data.readiness.find((item: { seasonId: string }) => item.seasonId === seasonId); }
	function regionsFor(seasonId: string) { return data.regions.filter((r: { seasonId: string }) => r.seasonId === seasonId).sort((a: { number: number }, b: { number: number }) => a.number - b.number); }
	function contestsFor(seasonId: string) { return data.contests.filter((c: { seasonId: string }) => c.seasonId === seasonId); }
	function regionalContestFor(regionId: string) { return data.contests.find((c: { regionId: string | null; kind: string }) => c.regionId === regionId && c.kind === 'regional'); }
	function stateContestFor(seasonId: string) { return data.contests.find((c: { seasonId: string; kind: string }) => c.seasonId === seasonId && c.kind === 'state'); }
	// Active seasons first, then setup, then archived; newest year first within each group.
	let sortedSeasons = $derived([...data.seasons].sort((a, b) => {
		const order = (s: string) => (s === 'active' ? 0 : s === 'setup' ? 1 : 2);
		return order(a.status) - order(b.status) || b.year - a.year;
	}));
</script>

<svelte:head><title>Program setup — WSMC</title></svelte:head>

<main>
	<h1>Program setup</h1>
	<p>Set up the current season: add regions (each region gets its one regional contest automatically), then ensure the single state contest.</p>
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if form?.success}<p class="success">{form.success}</p>{/if}

	<section class="forms">
		<div><h2>New season</h2><p class="muted">New seasons copy season coordinators from the most recent season. Regional coordinators are assigned per contest below.</p><form method="POST" action="?/createSeason">
			<label>Year <input type="number" name="year" min="2000" max="2200" required /></label>
			<label>Name <input name="name" placeholder="2027 WSMC" required /></label>
			<button type="submit">Create season</button>
		</form></div>
		<div><h2>Add region</h2><p class="muted">Number + name only. Date and coordinator come later. This also creates the region's contest.</p><form method="POST" action="?/createRegion">
			<label>Season <select name="seasonId" required>{#each sortedSeasons as season}<option value={season.id}>{season.year} — {season.name} ({season.status})</option>{/each}</select></label>
			<label>Number <input type="number" name="number" min="1" required /></label>
			<label>Name <input name="name" placeholder="Northwest" /></label>
			<button type="submit">Add region + contest</button>
		</form></div>
		<div><h2>State contest</h2><p class="muted">One per season. Created once; date and details edited below.</p><form method="POST" action="?/ensureStateContest">
			<label>Season <select name="seasonId" required>{#each sortedSeasons as season}<option value={season.id}>{season.year} — {season.name} ({season.status})</option>{/each}</select></label>
			<label>Name <small>(optional)</small> <input name="name" placeholder="2027 State Contest" /></label>
			<button type="submit">Ensure state contest</button>
		</form></div>
	</section>

	{#each sortedSeasons as season}
		<section class="card">
			<div class="card-head"><h3>{season.year} — {season.name}</h3><span class="status">{season.status}</span>
				<a href="/qualifications/{season.id}">Open qualifications</a><a href="/reports/season/{season.id}">Open statewide reports</a>
			</div>
			<form method="POST" action="?/setSeasonStatus"><input type="hidden" name="seasonId" value={season.id} /><select name="status"><option value="setup" selected={season.status === 'setup'}>setup</option><option value="active" selected={season.status === 'active'}>active</option><option value="archived" selected={season.status === 'archived'}>archived</option></select><button type="submit">Update status</button></form>
			<div class="readiness"><strong>{readinessFor(season.id)?.regionsReady && readinessFor(season.id)?.stateContestReady ? 'Setup ready' : 'Setup incomplete'}</strong><span>{readinessFor(season.id)?.contestCount ?? 0} contests · {readinessFor(season.id)?.outstandingInvitationCount ?? 0} outstanding invitations</span>{#if readinessFor(season.id)?.missingRegionalContestRegions.length}<span>Missing contests: {readinessFor(season.id)?.missingRegionalContestRegions.join(', ')}</span>{/if}</div>

			<h4>Regions + regional contests</h4>
			{#if regionsFor(season.id).length}
				<ul class="regions">
				{#each regionsFor(season.id) as region (region.id)}
					<li>
						<div><strong>Region {region.number}{region.name ? ` — ${region.name}` : ''}</strong>
						{#if regionalContestFor(region.id)}<span>{regionalContestFor(region.id)?.name} · {regionalContestFor(region.id)?.lifecycle}</span>{:else}<span class="error-inline">No contest yet — re-add this region.</span>{/if}
						</div>
						<details><summary>Correct region / contest details</summary>
							<form method="POST" action="?/updateRegion"><input type="hidden" name="regionId" value={region.id} />
								<label>Number <input type="number" name="number" value={region.number} min="1" /></label>
								<label>Name <input name="name" value={region.name ?? ''} /></label>
								<button type="submit">Save region</button>
							</form>
							{#if regionalContestFor(region.id)}
							<form method="POST" action="?/updateContestMeta"><input type="hidden" name="contestId" value={regionalContestFor(region.id)?.id} />
								<label>Contest name <input name="name" value={regionalContestFor(region.id)?.name} required /></label>
								<button type="submit">Save contest name</button>
							</form>
							<div class="links"><a href="/contests/{regionalContestFor(region.id)?.id}">Open contest overview</a>{#if ['roster_locked', 'scoring', 'finalized'].includes(regionalContestFor(region.id)?.lifecycle ?? '')}<a href="/scoring/{regionalContestFor(region.id)?.id}">Open scoring</a>{/if}{#if regionalContestFor(region.id)?.lifecycle === 'finalized'}<a href="/results/{regionalContestFor(region.id)?.id}">View results</a>{/if}<a href="/contests/{regionalContestFor(region.id)?.id}/staff">Manage staff</a></div>
							{/if}
						</details>
					</li>
				{/each}
				</ul>
			{:else}<p class="muted">No regions yet for this season.</p>{/if}

			<h4>State contest</h4>
			{#if stateContestFor(season.id)}
				<div class="state-row"><strong>{stateContestFor(season.id)?.name}</strong><span>{stateContestFor(season.id)?.lifecycle}</span>
					<a href="/state/{stateContestFor(season.id)?.id}">Open state administration</a>{#if ['roster_locked', 'scoring', 'finalized'].includes(stateContestFor(season.id)?.lifecycle ?? '')}<a href="/scoring/{stateContestFor(season.id)?.id}">Open scoring</a>{/if}
				</div>
				<form class="inline" method="POST" action="?/updateContestMeta"><input type="hidden" name="contestId" value={stateContestFor(season.id)?.id} />
					<label>Contest name <input name="name" value={stateContestFor(season.id)?.name} required /></label>
					<button type="submit">Save</button>
				</form>
			{:else}<p class="muted">No state contest yet — use “Ensure state contest” above.</p>{/if}

			{#if contestsFor(season.id).length}
			<details class="lifecycle"><summary>Contest lifecycle (advances in Chunk 3)</summary>
				<ul class="contests">{#each contestsFor(season.id) as contest}<li><div><strong>{contest.name}</strong><span>{contest.kind} · {contest.lifecycle}</span></div>{#if contest.lifecycle === 'finalized'}<p>Finalized. Publish or reopen from Scoring.</p>{:else}<form method="POST" action="?/setLifecycle"><input type="hidden" name="contestId" value={contest.id} /><input type="hidden" name="seasonId" value={contest.seasonId} /><select name="lifecycle">{#each lifecycleOptions as lifecycle}<option value={lifecycle} selected={lifecycle === contest.lifecycle}>{lifecycle}</option>{/each}</select><button type="submit">Update</button></form>{/if}</li>{/each}</ul>
			</details>
			{/if}
		</section>
	{/each}

	<p><a href="/reports/schools">Download school directory CSV</a></p>
</main>

<style>
	main { max-width: 1000px; margin: 0 auto; padding: 2rem; }
	.forms { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
	.forms > div, .card { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; }
	form { display: flex; flex-direction: column; gap: 0.65rem; }
	form.inline { flex-direction: row; align-items: end; margin-top: 0.5rem; }
	label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; }
	input, select { padding: 0.5rem; font: inherit; border: 1px solid #bbb; border-radius: 4px; }
	button { border: 0; border-radius: 4px; padding: 0.5rem 0.75rem; background: #1a1a2e; color: white; cursor: pointer; align-self: flex-start; }
	.card { margin: 0.75rem 0; }
	.card-head { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
	.card h3 { margin: 0; }
	.card h4 { margin: 1rem 0 0.4rem; }
	.status { background: #eee; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem; }
	.muted { color: #596273; font-size: 0.9rem; }
	.regions { list-style: none; padding: 0; margin: 0; }
	.regions li { border-bottom: 1px solid #eee; padding: 0.6rem 0; }
	.regions details { margin-top: 0.4rem; }
	.state-row { display: flex; gap: 0.8rem; align-items: baseline; flex-wrap: wrap; }
	.links { display: flex; gap: 0.8rem; margin-top: 0.4rem; flex-wrap: wrap; }
	.contests { list-style: none; padding: 0; }
	.contests li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-bottom: 1px solid #eee; padding: 0.6rem 0; }
	.lifecycle { margin-top: 0.8rem; }
	.error, .success { padding: 0.6rem; border-radius: 4px; }
	.error { background: #fbe3e3; color: #9a2020; }
	.success { background: #e2f5e8; color: #176b35; }
	.error-inline { color: #9a2020; font-size: 0.9rem; }
	@media (max-width: 800px) { .forms { grid-template-columns: 1fr; } }
</style>
