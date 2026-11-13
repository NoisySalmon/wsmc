<script lang="ts">
	import ContestStatus from '$lib/components/ContestStatus.svelte';
	let { data } = $props();
</script>

<svelte:head><title>My schools — WSMC</title></svelte:head>
<main>
	<h1>My schools</h1>
	<p>Manage regional and state registration for your schools.</p>
	{#if data.stateRegistrations.length}
		<h2>State registration</h2>
		{#each data.stateRegistrations as registration}
			<article>
				<h2>{registration.schoolName} · {registration.seasonYear}</h2>
				<p>{registration.contestName} · Division {registration.division} · <ContestStatus status={registration.contestLifecycle} /></p>
				<a href="/state/{registration.contestId}?schoolId={registration.schoolId}">Open state registration</a>
			</article>
		{/each}
	{/if}
	{#if data.participations.length}
		{#each data.participations as participation}
			<article>
				<h2>{participation.schoolName} · {participation.seasonYear}</h2>
				<p><strong>{participation.contestName}</strong> · {participation.contestKind} · Division {participation.division}</p>
				<p>Contest stage: <ContestStatus status={participation.contestLifecycle} /></p>
				{#if participation.contestKind === 'regional'}<a href="/registration/{participation.contestId}/{participation.schoolId}">Open school registration</a>{/if}
			</article>
		{/each}
	{:else if !data.stateRegistrations.length}
		<p>No contest participations are assigned to your coach account yet.</p>
	{/if}
</main>
<style>
	main { max-width: 850px; margin: 0 auto; padding: 2rem 1rem; }
	article { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; margin: 1rem 0; }
	h2 { margin: 0 0 .4rem; font-size: 1.15rem; }
</style>
