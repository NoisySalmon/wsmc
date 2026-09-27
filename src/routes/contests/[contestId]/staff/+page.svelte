<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>{data.contest.name} scorekeepers — WSMC</title></svelte:head>
<main>
	<p><a href="/contests/{data.contest.id}">← {data.contest.name}</a></p>
	<h1>Contest scorekeepers</h1>
	<p>Manage scorekeeper access for this regional contest only.</p>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}

	<section><h2>Current scorekeepers</h2>
		{#if data.scorekeepers.length}
			<ul>{#each data.scorekeepers as scorekeeper}<li><div><strong>{scorekeeper.displayName || scorekeeper.email}</strong><span>{scorekeeper.email} · {scorekeeper.status}</span></div><form method="POST" action="?/remove"><input type="hidden" name="userId" value={scorekeeper.userId} /><button class="quiet" type="submit">Remove from this contest</button></form></li>{/each}</ul>
		{:else}<p>No scorekeepers are assigned.</p>{/if}
	</section>

	<section><h2>Invite or assign a scorekeeper</h2>
		<p>Existing accounts receive this contest assignment. New accounts receive a sign-in invitation.</p>
		<form method="POST" action="?/invite"><label>Name <input name="displayName" required /></label><label>Email <input type="email" name="email" required /></label><button type="submit">Invite scorekeeper</button></form>
	</section>
</main>
<style>
	main { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
	section { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
	ul { list-style: none; padding: 0; } li { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: .75rem 0; border-bottom: 1px solid #eee; } li div { display: grid; gap: .2rem; } li span { color: #596273; }
	form { display: grid; gap: .7rem; max-width: 30rem; } label { display: grid; gap: .25rem; font-weight: 600; } input { box-sizing: border-box; min-height: 2.75rem; padding: .55rem; font: inherit; border: 1px solid #aaa; border-radius: 4px; }
	button { min-height: 2.75rem; padding: .55rem .8rem; border: 0; border-radius: 4px; background: #1a1a2e; color: white; cursor: pointer; justify-self: start; } button.quiet { background: #555; }
	.error, .success { padding: .6rem; border-radius: 4px; }.error { background: #fbe3e3; color: #9a2020; }.success { background: #e2f5e8; color: #176b35; }
	@media (max-width: 620px) { li { align-items: flex-start; flex-direction: column; } }
</style>
