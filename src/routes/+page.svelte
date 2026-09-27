<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>WSMC</title></svelte:head>

<main>
	<h1>Washington State Mathematics Council</h1>
	{#if data.principal}
		<p>Welcome back, {data.principal.displayName || data.principal.email}.</p>
		{#if data.principal.statewideSeasonIds.length || data.principal.regionalContestIds.length || data.principal.coachAssignments.length || data.principal.scorekeeperContestIds.length}
			<p>Your account is active. Use the navigation to continue.</p>
		{:else}
			<p>Your account is active, but no responsibilities are assigned yet. Ask a WSMC coordinator to grant access.</p>
		{/if}
	{:else}
		<p><a href="/login">Sign in</a> to continue.</p>
	{/if}
</main>

<style>
	main { max-width: 800px; margin: 0 auto; padding: 2rem; }
</style>
