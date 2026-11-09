<script lang="ts">
	import { enhance } from '$app/forms';
	import SeasonOverview from '$lib/components/SeasonOverview.svelte';
	let { data, form } = $props();
	const isAdmin = $derived((data.principal?.isAdmin ?? false));
	const isCoach = $derived((data.principal?.coachAssignments ?? []).length > 0);
	const current = $derived(data.seasons.find(s => s.status !== 'archived'));
	const archived = $derived(data.seasons.filter(s => s.status === 'archived'));
	const nextStage: Record<string, string> = { regional:'qualifications', qualifications:'state', state:'archived' };
	const nextLabel: Record<string, string> = { regional:'Begin qualifications', qualifications:'Open state contest', state:'Archive season permanently' };

</script>

<svelte:head><title>WSMC</title></svelte:head>

<main>
	<h1>Washington State Mathematics Council</h1>
	{#if data.principal}
		<p>Welcome back, {data.principal.displayName || data.principal.email}.</p>
		{#if isCoach && !isAdmin}
			<p>Start with <a href="/my-schools">My schools</a> to manage your roster.</p>
		{/if}
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}
		{#if current}
			<section class="card"><SeasonOverview season={current} contests={data.contests} regions={data.regions} canOpenState={isAdmin || isCoach} canOpenQualifications={isAdmin} />
				{#if isAdmin}
			<div class="advance">
				{#if current.status === 'regional'}<p>Plan qualifications as regional results are finalized.</p>{:else if current.status === 'qualifications'}<p>Finish the qualification draft, then freeze and publish it to open the state contest.</p>{:else}<p>Archiving permanently closes editing for this season. It cannot be reopened.</p>{/if}
				{#if current.status === 'qualifications'}<p><a href="/qualifications/{current.id}">Review and publish qualifications →</a></p>{:else}<form use:enhance method="POST" action="?/setSeasonStatus"><input type="hidden" name="seasonId" value={current.id} /><input type="hidden" name="status" value={nextStage[current.status]} /><button type="submit">{nextLabel[current.status]}</button></form>{/if}
			</div>
				{/if}
			</section>
		{:else if isAdmin}
		<section class="card"><h2>New season</h2><p>Creates the 11 fixed regional contests and the state contest. Active schools start in their prior season’s regions, with regional coordinators and coaches carried forward. You can change these assignments.</p>
			<form class="create" use:enhance method="POST" action="?/createSeason"><label>Year <input type="number" name="year" min="2000" max="2200" required /></label><button type="submit">Create season</button></form>
		</section>
		{:else}<p>No active season.</p>{/if}
		{#if archived.length}<details><summary>Archived seasons ({archived.length})</summary>{#each archived as season}<section class="card"><SeasonOverview {season} contests={data.contests} regions={data.regions} canOpenState={isAdmin || isCoach} canOpenQualifications={isAdmin} /></section>{/each}</details>{/if}

	{:else}
		<p><a href="/login">Sign in</a> to continue.</p>
	{/if}
</main>

<style>
	main { max-width:900px; margin:auto; padding:2rem 1rem; } h1 { margin-bottom:.4rem; }
	.card { border:1px solid #dce1e8; border-radius:8px; padding:1.5rem; margin:1rem 0; } .card h2 { margin-top:0; }
	.advance { border-top:1px solid #dce1e8; margin-top:1.5rem; padding-top:.5rem; } .advance p { color:#596273; line-height:1.5; }
	.create { display:flex; flex-wrap:wrap; gap:1rem; align-items:end; } label { display:flex; flex-direction:column; gap:.4rem; font-weight:600; } input { padding:.6rem; font:inherit; border:1px solid #aeb6c2; border-radius:4px; max-width:100%; box-sizing:border-box; }
	button { min-height:2.75rem; padding:.65rem 1rem; border:0; border-radius:4px; background:#1a1a2e; color:white; cursor:pointer; font:inherit; }
	button:disabled { background:#e5e7eb; color:#596273; cursor:not-allowed; }
	summary { cursor:pointer; font-weight:600; } .error,.success { padding:.8rem; border-radius:4px; } .error { background:#fbe3e3; color:#9a2020; } .success { background:#e2f5e8; color:#176b35; }

</style>
