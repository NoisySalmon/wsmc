<script lang="ts">
	let { data, form } = $props();
	const lifecycleOptions = ['setup', 'registration_open', 'roster_locked', 'scoring', 'finalized'];
	function readinessFor(seasonId: string) { return data.readiness.find((item: { seasonId: string }) => item.seasonId === seasonId); }
</script>

<svelte:head><title>Program setup — WSMC</title></svelte:head>

<main>
	<h1>Program setup</h1>
	<p>Manage annual seasons, numbered regions, regional contests, and state contest lifecycle.</p>
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if form?.success}<p class="success">{form.success}</p>{/if}

	<section class="forms">
		<div><h2>New season</h2><form method="POST" action="?/createSeason">
			<label>Year <input type="number" name="year" min="2000" max="2200" required /></label>
			<label>Name <input name="name" placeholder="2027 WSMC" required /></label>
			<button type="submit">Create season</button>
		</form></div>
		<div><h2>New region</h2><form method="POST" action="?/createRegion">
			<label>Season <select name="seasonId" required>{#each data.seasons as season}<option value={season.id}>{season.year} — {season.name}</option>{/each}</select></label>
			<label>Number <input type="number" name="number" min="1" required /></label>
			<label>Name <input name="name" placeholder="Northwest" /></label>
			<button type="submit">Add region</button>
		</form></div>
		<div><h2>New contest</h2><form method="POST" action="?/createContest">
			<label>Season <select name="seasonId" required>{#each data.seasons as season}<option value={season.id}>{season.year} — {season.name}</option>{/each}</select></label>
			<label>Type <select name="kind"><option value="regional">Regional</option><option value="state">State</option></select></label>
			<label>Region ID <input name="regionId" placeholder="Required for regional contests" /></label>
			<label>Name <input name="name" required /></label>
			<label>Start <input type="datetime-local" name="startsAt" /></label>
			<label>State: allow all state students in Topical Individual <select name="topicalIndividualAllowed"><option value="yes">Yes</option><option value="no">No</option></select></label>
			<label>State: allow cross-school Topical Teams <select name="crossSchoolTopicalTeamsAllowed"><option value="yes">Yes</option><option value="no">No</option></select></label>
			<button type="submit">Create contest</button>
		</form></div>
	</section>

	<h2>Seasons</h2>
	{#each data.seasons as season}
		<section class="card"><div><h3>{season.year} — {season.name}</h3><span class="status">{season.status}</span></div>
			<form method="POST" action="?/setSeasonStatus"><input type="hidden" name="seasonId" value={season.id} /><select name="status"><option value="setup">setup</option><option value="active">active</option><option value="archived">archived</option></select><button type="submit">Update status</button></form>
			<div class="readiness"><strong>{readinessFor(season.id)?.regionsReady && readinessFor(season.id)?.stateContestReady ? 'Setup ready' : 'Setup incomplete'}</strong><span>{readinessFor(season.id)?.contestCount ?? 0} contests · {readinessFor(season.id)?.outstandingInvitationCount ?? 0} outstanding invitations</span>{#if readinessFor(season.id)?.missingRegionalContestRegions.length}<span>Missing contests: {readinessFor(season.id)?.missingRegionalContestRegions.join(', ')}</span>{/if}</div>
		</section>
	{/each}

	<h2>Contests</h2>
	<ul class="contests">{#each data.contests as contest}<li><div><strong>{contest.name}</strong><span>{contest.kind} · {contest.lifecycle}</span></div><form method="POST" action="?/setLifecycle"><input type="hidden" name="contestId" value={contest.id} /><input type="hidden" name="seasonId" value={contest.seasonId} /><select name="lifecycle">{#each lifecycleOptions as lifecycle}<option value={lifecycle} selected={lifecycle === contest.lifecycle}>{lifecycle}</option>{/each}</select><button type="submit">Update</button></form></li>{/each}</ul>
</main>

<style>
	main { max-width: 1000px; margin: 0 auto; padding: 2rem; }
	.forms { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
	.forms > div, .card { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; }
	form { display: flex; flex-direction: column; gap: 0.65rem; }
	label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; }
	input, select { padding: 0.5rem; font: inherit; border: 1px solid #bbb; border-radius: 4px; }
	button { border: 0; border-radius: 4px; padding: 0.5rem 0.75rem; background: #1a1a2e; color: white; cursor: pointer; }
	.card { margin: 0.75rem 0; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
	.card h3 { margin: 0 0 0.3rem; }
	.status { background: #eee; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem; }
	.contests { list-style: none; padding: 0; }
	.contests li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-bottom: 1px solid #eee; padding: 0.8rem 0; }
	.contests li div { display: flex; flex-direction: column; gap: 0.2rem; }
	.contests span { color: #666; font-size: 0.9rem; }
	.error, .success { padding: 0.6rem; border-radius: 4px; }
	.error { background: #fbe3e3; color: #9a2020; }
	.success { background: #e2f5e8; color: #176b35; }
	@media (max-width: 800px) { .forms { grid-template-columns: 1fr; } .card, .contests li { align-items: flex-start; flex-direction: column; } }
</style>
