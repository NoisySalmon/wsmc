<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>My schools — WSMC</title></svelte:head>
<main>
	<h1>My schools</h1>
	<p>Review participation invitations for schools assigned to your coach account.</p>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}
	{#if data.participations.length}
		{#each data.participations as participation}
			<article>
				<h2>{participation.schoolName} · {participation.seasonName}</h2>
				<p><strong>{participation.contestName}</strong> · {participation.contestKind} · Division {participation.division}</p>
				<p>Invitation status: <strong>{participation.invitationStatus}</strong> · Contest stage: {participation.contestLifecycle}</p>
				{#if participation.contestKind === 'regional'}<a href="/registration/{participation.contestId}/{participation.schoolId}">Open school registration</a>{/if}
				{#if participation.canRespond && ['pending', 'invited'].includes(participation.invitationStatus)}
					<div class="actions">
						<form method="POST" action="?/respond"><input type="hidden" name="participationId" value={participation.id} /><input type="hidden" name="contestId" value={participation.contestId} /><input type="hidden" name="status" value="accepted" /><button type="submit">Accept invitation</button></form>
						<form method="POST" action="?/respond"><input type="hidden" name="participationId" value={participation.id} /><input type="hidden" name="contestId" value={participation.contestId} /><input type="hidden" name="status" value="declined" /><button class="quiet" type="submit">Decline invitation</button></form>
					</div>
				{:else if participation.contestKind === 'regional' && !participation.canRespond}
					<p class="muted">Responses are closed for this contest.</p>
				{/if}
			</article>
		{/each}
	{:else}
		<p>No contest participations are assigned to your coach account yet.</p>
	{/if}
</main>
<style>
	main { max-width: 850px; margin: 0 auto; padding: 2rem 1rem; }
	article { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; margin: 1rem 0; }
	h2 { margin: 0 0 .4rem; font-size: 1.15rem; }
	.actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .8rem; }
	button { min-height: 2.75rem; padding: .55rem .8rem; border: 0; border-radius: 4px; background: #1a1a2e; color: white; cursor: pointer; }
	button.quiet { background: #555; }
	.muted { color: #596273; }
	.error, .success { padding: .6rem; border-radius: 4px; }.error { background: #fbe3e3; color: #9a2020; }.success { background: #e2f5e8; color: #176b35; }
</style>
