<script lang="ts">
	let { data, form } = $props();
	type Duplicate = { id: string; name: string; city: string; active: boolean };
	let duplicateForm = $derived(form as unknown as { duplicates?: Duplicate[]; name?: string; city?: string } | undefined);
</script>

<svelte:head><title>School directory — WSMC</title></svelte:head>

<main>
	<h1>School directory</h1>
	<p>Maintain reusable school records. Inactive schools remain available for historical records but cannot be newly selected.</p>
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if form?.success}<p class="success">{form.success}</p>{/if}
	{#if duplicateForm?.duplicates?.length}
		<div class="warning"><strong>Possible duplicate:</strong>{#each duplicateForm.duplicates as duplicate}<span>{duplicate.name} — {duplicate.city} ({duplicate.active ? 'active' : 'inactive'})</span>{/each}<p>Submit again with the duplicate confirmation if this is a separate school.</p>
			<form method="POST" action="?/create"><input type="hidden" name="confirmDuplicate" value="yes" /><input type="hidden" name="name" value={duplicateForm.name ?? ''} /><input type="hidden" name="city" value={duplicateForm.city ?? ''} /><button type="submit">Create anyway</button></form>
		</div>
	{/if}

	<section>
		<h2>Add school</h2>
		<form method="POST" action="?/create">
			<label>Name <input name="name" required /></label><label>Short name <input name="shortName" /></label>
			<label>Address <input name="address" /></label><div class="row"><label>City <input name="city" required /></label><label>State <input name="state" value="WA" maxlength="2" /></label><label>ZIP <input name="postalCode" /></label></div>
			<label>Contact email <input type="email" name="contactEmail" /></label><button type="submit">Add school</button>
		</form>
	</section>

	<section><h2>Schools</h2><ul>{#each data.schools as school}<li><div><strong>{school.name}</strong><span>{school.city}, {school.state} {#if school.shortName}· {school.shortName}{/if}</span><span class:inactive={!school.active} class="status">{school.active ? 'active' : 'inactive'}</span></div><form method="POST" action="?/setActive"><input type="hidden" name="schoolId" value={school.id} /><input type="hidden" name="active" value={school.active ? 'no' : 'yes'} /><button type="submit">{school.active ? 'Mark inactive' : 'Reactivate'}</button></form></li>{/each}</ul></section>
</main>

<style>
	main { max-width: 900px; margin: 0 auto; padding: 2rem; }
	section { margin-top: 2rem; border-top: 1px solid #ddd; padding-top: 1rem; }
	form { display: flex; flex-direction: column; gap: 0.65rem; max-width: 34rem; }
	label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; }
	input { padding: 0.5rem; border: 1px solid #bbb; border-radius: 4px; font: inherit; }
	.row { display: grid; grid-template-columns: 2fr 0.7fr 1fr; gap: 0.7rem; }
	button { background: #1a1a2e; color: white; border: 0; border-radius: 4px; padding: 0.5rem 0.8rem; cursor: pointer; align-self: flex-start; }
	ul { list-style: none; padding: 0; } li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border-bottom: 1px solid #eee; padding: 0.8rem 0; } li div { display: flex; flex-wrap: wrap; gap: 0.7rem; align-items: baseline; } li span { color: #666; } .status { background: #e2f5e8; color: #176b35; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem; } .status.inactive { background: #eee; color: #666; }
	.error, .success, .warning { padding: 0.6rem; border-radius: 4px; } .error { background: #fbe3e3; color: #9a2020; } .success { background: #e2f5e8; color: #176b35; } .warning { background: #fff5d6; color: #715500; display: flex; flex-direction: column; gap: 0.4rem; }
	@media (max-width: 700px) { .row { grid-template-columns: 1fr; } li { align-items: flex-start; flex-direction: column; } }
</style>
