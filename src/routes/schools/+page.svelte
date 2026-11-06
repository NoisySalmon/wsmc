<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	type Duplicate = { id: string; name: string; city: string; active: boolean };
	let duplicateForm = $derived(form as unknown as { duplicates?: Duplicate[]; name?: string; city?: string } | undefined);
</script>

<svelte:head><title>School directory — WSMC</title></svelte:head>

<main>
	<h1>School directory</h1>
	<p>Maintain reusable school records. Inactive schools remain available for historical records but cannot be newly selected.</p>
	<p>Manage school participation and coach assignments in <a href="/participation">Participation</a>.{#if data.canAdministerUsers} Manage accounts and access in <a href="/admin/users">Users</a>.{/if}</p>
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if form?.success}<p class="success">{form.success}</p>{/if}
	{#if duplicateForm?.duplicates?.length}
		<div class="warning"><strong>Possible duplicate:</strong>{#each duplicateForm.duplicates as duplicate}<span>{duplicate.name} — {duplicate.city} ({duplicate.active ? 'active' : 'inactive'})</span>{/each}<p>Submit again with the duplicate confirmation if this is a separate school.</p>
			<form method="POST" action="?/create"><input type="hidden" name="confirmDuplicate" value="yes" /><input type="hidden" name="name" value={duplicateForm.name ?? ''} /><input type="hidden" name="city" value={duplicateForm.city ?? ''} /><button type="submit">Create anyway</button></form>
		</div>
	{/if}

	<section>
		<h2>Add school</h2>
		<form method="POST" action="?/create" use:enhance>
			<label>Name <input name="name" required /></label><label>Short name <input name="shortName" /></label>
			<label>Address <input name="address" /></label><div class="row"><label>City <input name="city" required /></label><label>State <input name="state" value="WA" maxlength="2" /></label><label>ZIP <input name="postalCode" /></label></div>
			<div class="row"><label>Division <select name="division"><option value="1">Division 1</option><option value="2">Division 2</option></select></label><label>Contact email <input type="email" name="contactEmail" /></label></div><button type="submit">Add school</button>
		</form>
	</section>

	<section>
		<h2>Schools</h2>
		<ul>
			{#each data.schools as school}
				<li>
					<div class="school-info">
						<div class="school-heading"><strong>{school.name}</strong><span class:inactive={!school.active} class="status">{school.active ? 'active' : 'inactive'}</span></div>
						{#if school.shortName && school.shortName !== school.name}<span>Short name: {school.shortName}</span>{/if}
						{#if school.address || school.city || school.postalCode}
							<span>{[school.address, [school.city, school.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span>
						{/if}
						{#if school.contactEmail}<span>Contact: <a href="mailto:{school.contactEmail}">{school.contactEmail}</a></span>{/if}
					</div>
					<div class="school-actions">
						<form method="POST" action="?/updateDivision" use:enhance>
							<input type="hidden" name="schoolId" value={school.id} />
							<label>Division <select name="division" aria-label="Division for {school.name}"><option value="1" selected={(school.division ?? 1) === 1}>Division 1</option><option value="2" selected={(school.division ?? 1) === 2}>Division 2</option></select></label>
							<button type="submit">Save division</button>
						</form>
						<form method="POST" action="?/setActive" use:enhance>
							<input type="hidden" name="schoolId" value={school.id} /><input type="hidden" name="active" value={school.active ? 'no' : 'yes'} />
							<button type="submit">{school.active ? 'Mark inactive' : 'Reactivate'}</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	</section>
</main>

<style>
	main { max-width: 900px; margin: 0 auto; padding: 2rem; }
	section { margin-top: 2rem; border-top: 1px solid #ddd; padding-top: 1rem; }
	form { display: flex; flex-direction: column; gap: 0.65rem; max-width: 34rem; }
	label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; }
	input, select { padding: 0.5rem; border: 1px solid #bbb; border-radius: 4px; font: inherit; }
	.school-actions { display: grid; grid-template-columns: auto 7.5rem; gap: 0.75rem; align-items: end; }
	.school-actions form { flex-direction: row; align-items: end; }
	.school-actions button { align-self: flex-end; min-height: 2.5rem; white-space: nowrap; }
	.school-actions select { min-height: 2.5rem; }
	.row { display: grid; grid-template-columns: 2fr 0.7fr 1fr; gap: 0.7rem; }
	button { background: #1a1a2e; color: white; border: 0; border-radius: 4px; padding: 0.5rem 0.8rem; cursor: pointer; align-self: flex-start; }
	ul { list-style: none; padding: 0; }
	li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 1.5rem; border-bottom: 1px solid #eee; padding: 1rem 0; }
	.school-info { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; overflow-wrap: anywhere; }
	.school-info > span { color: #666; }
	.school-heading { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
	.status { background: #e2f5e8; color: #176b35; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem; }
	.status.inactive { background: #eee; color: #666; }
	.error, .success, .warning { padding: 0.6rem; border-radius: 4px; } .error { background: #fbe3e3; color: #9a2020; } .success { background: #e2f5e8; color: #176b35; } .warning { background: #fff5d6; color: #715500; display: flex; flex-direction: column; gap: 0.4rem; }
	@media (max-width: 700px) { .row { grid-template-columns: 1fr; } li { grid-template-columns: 1fr; gap: 0.75rem; } .school-actions { display: flex; flex-wrap: wrap; } }
</style>
