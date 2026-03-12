<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>{data.contest.name} — WSMC</title>
</svelte:head>

<main>
	<p class="breadcrumb"><a href="/contests">← Contests</a></p>

	<h1>{data.contest.name}</h1>

	{#if form?.success}
		<p class="success">Contest updated.</p>
	{/if}
	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<details>
		<summary>Edit Contest Details</summary>
		<form method="POST" action="?/update">
			<label>
				Name
				<input type="text" name="name" value={data.contest.name} required />
			</label>
			<div class="row">
				<label>
					Region
					<input type="number" name="region" value={data.contest.region} required />
				</label>
				<label>
					Year
					<input type="number" name="year" value={data.contest.year} required />
				</label>
			</div>
			<label>
				Contest Chair
				<input type="text" name="contest_chair" value={data.contest.contestChair} />
			</label>
			<label>
				Regional Director
				<input type="text" name="regional_director" value={data.contest.regionalDirector} />
			</label>
			<label>
				Status
				<select name="status">
					{#each ['setup', 'active', 'scoring', 'finalized'] as s}
						<option value={s} selected={data.contest.status === s}>{s}</option>
					{/each}
				</select>
			</label>
			<div class="actions">
				<button type="submit">Save Changes</button>
			</div>
		</form>
		<form method="POST" action="?/delete" class="delete-form">
			<button type="submit" class="delete-btn" onclick={(e) => { if (!confirm('Delete this contest and all its data?')) e.preventDefault(); }}>Delete Contest</button>
		</form>
	</details>

	<hr />

	<div class="contest-actions">
		<a href="/contests/{data.contest.id}/scores" class="btn">📝 Score Entry</a>
		<a href="/contests/{data.contest.id}/leaderboard" class="btn">🏆 Leaderboard</a>
	</div>

	<hr />

	<div class="schools-header">
		<h2>Schools ({data.schools.length})</h2>
		<a href="/contests/{data.contest.id}/schools/new" class="btn">+ Add School</a>
	</div>

	{#if data.schools.length === 0}
		<p>No schools registered yet.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>School</th>
					<th>Short</th>
					<th>Division</th>
					<th>Coach</th>
					<th>Email</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.schools as school}
					<tr>
						<td>{school.name}</td>
						<td>{school.shortName}</td>
						<td>{school.division}</td>
						<td>{school.coachName}</td>
						<td>{school.coachEmail}</td>
						<td><a href="/contests/{data.contest.id}/schools/{school.id}">Edit</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>

<style>
	main {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}
	.breadcrumb a {
		color: #666;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.breadcrumb a:hover {
		color: #1a1a2e;
	}
	details {
		background: #f8f8f8;
		padding: 1rem;
		border-radius: 6px;
		margin: 1rem 0;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 500px;
		margin-top: 1rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-weight: 500;
		font-size: 0.9rem;
	}
	input, select {
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
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	button {
		padding: 0.6rem 1.2rem;
		background: #1a1a2e;
		color: #fff;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
	}
	button:hover {
		background: #2a2a4e;
	}
	.delete-form {
		margin-top: 1rem;
		border-top: 1px solid #ddd;
		padding-top: 1rem;
	}
	.delete-btn {
		background: #c00;
	}
	.delete-btn:hover {
		background: #a00;
	}
	.schools-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.btn {
		display: inline-block;
		padding: 0.5rem 1rem;
		background: #1a1a2e;
		color: #fff;
		text-decoration: none;
		border-radius: 4px;
		font-size: 0.9rem;
	}
	.btn:hover {
		background: #2a2a4e;
	}
	.contest-actions {
		display: flex;
		gap: 0.75rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin: 1rem 0;
	}
	th, td {
		text-align: left;
		padding: 0.5rem;
		border-bottom: 1px solid #ddd;
	}
	th {
		font-weight: 600;
	}
	td a {
		color: #1a1a2e;
	}
	hr {
		border: none;
		border-top: 1px solid #ddd;
		margin: 1.5rem 0;
	}
	.success {
		color: #060;
		background: #efe;
		padding: 0.5rem;
		border-radius: 4px;
	}
	.error {
		color: #c00;
		background: #fee;
		padding: 0.5rem;
		border-radius: 4px;
	}
</style>
