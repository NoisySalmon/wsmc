<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Add School — {data.contest.name}</title>
</svelte:head>

<main>
	<p class="breadcrumb">
		<a href="/contests/{data.contest.id}">← {data.contest.name}</a>
	</p>

	<h1>Add School</h1>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<form method="POST">
		<label>
			School Name *
			<input type="text" name="name" required />
		</label>
		<label>
			Short Name
			<input type="text" name="short_name" placeholder="e.g. KHS" />
		</label>
		<label>
			Division *
			<select name="division" required>
				<option value="">Select…</option>
				<option value="1">Division 1 (Larger schools)</option>
				<option value="2">Division 2 (Smaller schools)</option>
			</select>
		</label>

		<fieldset>
			<legend>Coach Information</legend>
			<label>
				Coach Name
				<input type="text" name="coach_name" />
			</label>
			<label>
				Coach Email
				<input type="email" name="coach_email" />
			</label>
			<label>
				Coach Phone
				<input type="tel" name="coach_phone" />
			</label>
		</fieldset>

		<fieldset>
			<legend>School Address</legend>
			<label>
				Address
				<input type="text" name="address" />
			</label>
			<label>
				City / ZIP
				<input type="text" name="city_zip" />
			</label>
		</fieldset>

		<div class="actions">
			<button type="submit">Add School</button>
			<a href="/contests/{data.contest.id}" class="cancel">Cancel</a>
		</div>
	</form>
</main>

<style>
	main {
		max-width: 600px;
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
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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
	fieldset {
		border: 1px solid #ddd;
		border-radius: 6px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	legend {
		font-weight: 600;
		font-size: 0.9rem;
		padding: 0 0.25rem;
	}
	.actions {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-top: 0.5rem;
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
	.cancel {
		color: #666;
		text-decoration: none;
	}
	.cancel:hover {
		color: #1a1a2e;
	}
	.error {
		color: #c00;
		background: #fee;
		padding: 0.5rem;
		border-radius: 4px;
	}
</style>
