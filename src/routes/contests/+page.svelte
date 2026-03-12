<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Contests — WSMC</title>
</svelte:head>

<main>
	<h1>Contests</h1>

	{#if data.contests.length === 0}
		<p>No contests yet. Create one below.</p>
	{:else}
		<ul class="contest-list">
			{#each data.contests as contest}
				<li>
					<a href="/contests/{contest.id}">
						<strong>{contest.name}</strong> ({contest.year})
					</a>
					<span class="status">{contest.status}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<h2>Create Contest</h2>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<form method="POST" action="?/create">
		<label>
			Name
			<input type="text" name="name" placeholder="Region 5 WSMC Regional" required />
		</label>
		<div class="row">
			<label>
				Region
				<input type="number" name="region" placeholder="5" required />
			</label>
			<label>
				Year
				<input type="number" name="year" value={new Date().getFullYear()} required />
			</label>
		</div>
		<label>
			Contest Chair
			<input type="text" name="contest_chair" />
		</label>
		<label>
			Regional Director
			<input type="text" name="regional_director" />
		</label>
		<button type="submit">Create Contest</button>
	</form>
</main>

<style>
	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}
	.contest-list {
		list-style: none;
		padding: 0;
	}
	.contest-list li {
		padding: 0.75rem 0;
		border-bottom: 1px solid #eee;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.contest-list a {
		color: #1a1a2e;
		text-decoration: none;
	}
	.contest-list a:hover {
		text-decoration: underline;
	}
	.status {
		font-size: 0.85rem;
		color: #666;
		background: #f0f0f0;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 500px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-weight: 500;
		font-size: 0.9rem;
	}
	input {
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 1rem;
	}
	.row {
		display: flex;
		gap: 1rem;
	}
	.row label {
		flex: 1;
	}
	button {
		padding: 0.6rem 1.2rem;
		background: #1a1a2e;
		color: #fff;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		align-self: flex-start;
	}
	button:hover {
		background: #2a2a4e;
	}
	.error {
		color: #c00;
		background: #fee;
		padding: 0.5rem;
		border-radius: 4px;
	}
</style>
