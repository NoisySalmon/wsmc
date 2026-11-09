<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	type Duplicate = { id: string; name: string; city: string; active: boolean };
	let duplicateForm = $derived(form as unknown as { duplicates?: Duplicate[]; editingId?: string; values?: Record<string, FormDataEntryValue> } | undefined);
	function field(schoolId: string | undefined, key: string, fallback: string): string {
		return duplicateForm?.values && duplicateForm.editingId === schoolId ? String(duplicateForm.values[key] ?? fallback) : fallback;
	}

</script>

<svelte:head><title>School directory — WSMC</title></svelte:head>

<main>
	<h1>School directory</h1>
	<p>Maintain reusable school records. Inactive schools remain available for historical records but cannot be newly selected.</p>
	<p>Manage school participation in <a href="/regions">Regions</a>.{#if data.canAdministerUsers}{' '}Manage accounts and access in <a href="/admin/users">Users</a>.{/if}</p>
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if form?.success && !form.savedSchoolId}<p class="success" role="status">{form.success}</p>{/if}
	{#if duplicateForm?.duplicates?.length}
		<div class="warning"><strong>Possible duplicate:</strong>{#each duplicateForm.duplicates as duplicate}<span>{duplicate.name} — {duplicate.city} ({duplicate.active ? 'active' : 'inactive'})</span>{/each}<p>Submit again with the duplicate confirmation if this is a separate school.</p>
			<form method="POST" action={duplicateForm.editingId ? '?/update' : '?/create'} use:enhance>
				{#each Object.entries(duplicateForm.values ?? {}) as [key, value]}{#if key !== 'confirmDuplicate'}<input type="hidden" name={key} value={String(value)} />{/if}{/each}
				<input type="hidden" name="confirmDuplicate" value="yes" /><button type="submit">{duplicateForm.editingId ? 'Save anyway' : 'Create anyway'}</button>
			</form>
		</div>
	{/if}

	<section>
		<h2>Add school</h2>
		<form method="POST" action="?/create" use:enhance>
			<label>Name <input name="name" value={field(undefined, 'name', '')} required /></label><label>Short name <input name="shortName" value={field(undefined, 'shortName', '')} /></label>
			<label>Address <input name="address" value={field(undefined, 'address', '')} /></label><div class="row"><label>City <input name="city" value={field(undefined, 'city', '')} required /></label><label>State <input value="WA" readonly aria-label="State (Washington)" /></label><label>ZIP <input name="postalCode" value={field(undefined, 'postalCode', '')} /></label></div>
			<div class="row"><label>Division <select name="division"><option value="1" selected={field(undefined, 'division', '1') === '1'}>Division 1</option><option value="2" selected={field(undefined, 'division', '1') === '2'}>Division 2</option></select></label></div><button type="submit">Add school</button>
		</form>
	</section>

	<section>
		<h2>Schools</h2>
		<ul>
			{#each data.schools as school (school.id)}
				<li>
					<div class="school-info">
						<div class="school-heading"><strong>{school.name}</strong><span class:inactive={!school.active} class="status">{school.active ? 'active' : 'inactive'}</span></div>
						{#if school.shortName && school.shortName !== school.name}<span>Short name: {school.shortName}</span>{/if}
						{#if school.address || school.city || school.postalCode}
							<span>{[school.address, [school.city, school.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span>
						{/if}
						<span>Division {school.division ?? 1}</span>
						{#if !school.address}<span>Street address missing</span>{/if}
					</div>
					<div class="school-actions">
						<form method="POST" action="?/setActive" use:enhance>
							<input type="hidden" name="schoolId" value={school.id} /><input type="hidden" name="active" value={school.active ? 'no' : 'yes'} />
							<button type="submit">{school.active ? 'Mark inactive' : 'Reactivate'}</button>
						</form>
					</div>
					<details id="edit-{school.id}" class="edit-school" open={duplicateForm?.editingId === school.id || form?.savedSchoolId === school.id}>
						<summary>Edit {school.name}</summary>
						<form method="POST" action="?/update" use:enhance={() => async ({ update }) => {
							// Edit fields must keep their saved values after invalidation.
							await update({ reset: false });
						}}>
							<input type="hidden" name="schoolId" value={school.id} />
							<label>Name <input name="name" value={field(school.id, 'name', school.name)} required /></label>
							<label>Short name <input name="shortName" value={field(school.id, 'shortName', school.shortName)} /></label>
							<label>Address <input name="address" value={field(school.id, 'address', school.address)} /></label>
							<div class="row"><label>City <input name="city" value={field(school.id, 'city', school.city)} required /></label><label>State <input value="WA" readonly /></label><label>ZIP <input name="postalCode" value={field(school.id, 'postalCode', school.postalCode)} /></label></div>
							<label>Division <select name="division"><option value="1" selected={field(school.id, 'division', String(school.division)) === '1'}>Division 1</option><option value="2" selected={field(school.id, 'division', String(school.division)) === '2'}>Division 2</option></select></label>
							<button type="submit">Save school</button>
							{#if form?.success && form.savedSchoolId === school.id}
								<p class="success" role="status">{form.success}</p>
							{/if}
						</form>
					</details>
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
	input, select { min-width: 0; padding: 0.5rem; border: 1px solid #bbb; border-radius: 4px; font: inherit; }
	.school-actions { display: grid; grid-template-columns: auto 7.5rem; gap: 0.75rem; align-items: end; }
	.school-actions form { flex-direction: row; align-items: end; }
	.school-actions button { align-self: flex-end; min-height: 2.5rem; white-space: nowrap; }
	.edit-school { grid-column: 1 / -1; }
	summary { cursor: pointer; font-weight: 600; }
	.edit-school form { margin-top: 1rem; }
	.row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 0.7fr) minmax(0, 1fr); gap: 0.7rem; }
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
