<script lang="ts">
	import { enhance } from '$app/forms';
	import ContestSettings from '$lib/components/ContestSettings.svelte';
	let { data, form } = $props();
	let schoolDialog: HTMLDialogElement;
	let search = $state('');
	let createSchool = $state(false);
	const editableParticipation = $derived(data.canManageContest && ['setup', 'registration_open'].includes(data.contest.lifecycle));
	const matchingSchools = $derived(data.availableSchools.filter(school => `${school.name} ${school.city}`.toLowerCase().includes(search.toLowerCase())));
	$effect(() => { if (form?.addSchoolError) schoolDialog?.showModal(); });
</script>

<svelte:head><title>{data.contest.name} overview — WSMC</title></svelte:head>
<main>
	{#if data.canViewRegions}<p><a href="/regions">← Regions</a></p>{/if}
	<h1>{data.contest.name}</h1>
	<p class="subheading">Regional contest · {data.contest.lifecycle}{#if data.contest.resultsPublishedAt} · results published{/if}</p>
	<ContestSettings contest={data.contest} canManage={data.canManageContest} />
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}
	<nav aria-label="Contest tools">{#if data.canViewRegions}<a href="/regions">Regions</a>{/if}{#if ['roster_locked', 'scoring', 'finalized'].includes(data.contest.lifecycle)}<a href="/scoring/{data.contest.id}">Scoring</a>{/if}{#if data.contest.lifecycle === 'finalized'}<a href="/results/{data.contest.id}">Results</a>{/if}{#if data.canManageStaff}<a href="/contests/{data.contest.id}/staff">People</a>{/if}</nav>

	<section class="summary" aria-label="Contest summary">
		<div><strong>{data.activeSchoolCount}</strong><span>participating schools</span></div>
		<div><strong>{data.rosteredStudentCount}</strong><span>distinct rostered students</span></div>
		<div><strong>{data.entries.length}</strong><span>competition entries</span></div>
		<div><strong>{data.completedEntryCount} / {data.entries.length}</strong><span>entries with complete results</span></div>
	</section>

	<section><div class="section-heading"><h2>School participation and rosters</h2>{#if editableParticipation}<button type="button" onclick={() => schoolDialog.showModal()}>Add school</button>{/if}</div>
		{#if data.contest.lifecycle === 'registration_open'}<p role="status">{#if data.registrationIssueCount}{data.registrationIssueCount} school registration(s) need attention before rosters can be locked.{:else}No registration issues found. Schools with no registration have no competition entries.{/if}</p>{/if}
		<p class="muted">Registration status updates automatically. Withdrawn schools keep their registration and are excluded from scoring and results.</p>
		{#if data.schools.length}
			<div class="table-wrap"><table><thead><tr><th>School</th><th>Division</th><th>Students / entries</th><th>Registration status</th><th>School registration</th></tr></thead><tbody>
			{#each data.schools as school}
				<tr><td>{school.name}</td><td>Division {school.division}</td><td>{school.students.length} students · {school.entryCount} entries{#if school.students.length}<details><summary>View roster</summary><ul>{#each school.students as student}<li>{student.studentName} (grade {student.actualGrade})</li>{/each}</ul></details>{/if}</td><td><span class:valid={school.readiness.status === 'Valid'} class:attention={school.readiness.status === 'Needs attention'} class="status">{school.readiness.status}</span>{#if !school.withdrawn && school.readiness.issues.length}<ul>{#each school.readiness.issues as issue}<li>{issue}</li>{/each}</ul>{/if}</td><td><a href="/registration/{data.contest.id}/{school.id}">Open registration</a>{#if data.canManageStaff} · <a href="/contests/{data.contest.id}/staff#school-{school.id}">Manage coaches</a>{/if}
				{#if data.canManageContest && data.contest.lifecycle !== 'finalized'}
					{#if data.contest.lifecycle === 'setup' && !school.withdrawn && !school.students.length && !school.entryCount}<form method="POST" action="?/removeSchool" use:enhance><input type="hidden" name="participationId" value={school.participationId} /><button type="submit">Remove participation</button></form>
					{:else}<form method="POST" action={school.withdrawn ? '?/restoreSchool' : '?/withdrawSchool'} use:enhance><input type="hidden" name="participationId" value={school.participationId} /><button type="submit">{school.withdrawn ? 'Restore participation' : 'Withdraw school'}</button></form>{/if}
				{/if}</td></tr>
			{/each}
			</tbody></table></div>
		{:else}<p class="muted">No schools have been assigned to this contest.</p>{/if}
	</section>

	<section><h2>Entry and scoring coverage</h2><p class="muted">Knowdown outcomes record each entrant as placed or eliminated; places 1 through 4 are unique across the contest.</p><div class="table-wrap"><table><thead><tr><th>Category</th><th>Entries</th><th>Complete results</th><th>Missing</th></tr></thead><tbody>
		{#each data.categoryCoverage as row}<tr><td>{row.label}</td><td>{row.total}</td><td>{row.complete}</td><td>{row.total - row.complete}</td></tr>{/each}
		</tbody></table></div></section>

	<section><h2>Registered entries</h2>
		{#if data.entries.length}<div class="table-wrap"><table class="entries"><thead><tr><th>Category</th><th>Division</th><th>School</th><th>Entry</th><th>Participants</th><th>Result</th></tr></thead><tbody>
		{#each data.entries as entry}
			<tr><td>{entry.categoryLabel}</td><td>Division {entry.division}</td><td>{entry.schoolName}</td><td>{entry.entryNumber ?? '—'}</td><td>{entry.members.map((member) => `${member.studentName} (grade ${member.actualGrade}${member.competingGrade !== null && member.competingGrade !== member.actualGrade ? `, competing ${member.competingGrade}` : ''})`).join(', ') || 'No participants listed'}</td><td>{entry.complete ? 'Complete' : 'Missing'}</td></tr>
		{/each}
		</tbody></table></div>{:else}<p class="muted">No competition entries have been registered.</p>{/if}
	</section>

	<dialog bind:this={schoolDialog} aria-labelledby="add-school-title">
		<div class="section-heading"><h2 id="add-school-title">Add school to {data.contest.name}</h2><button type="button" onclick={() => schoolDialog.close()}>Close</button></div>
		{#if form?.addSchoolError}<p class="error" role="alert">{form.error}</p>{/if}
		<label>Find an existing school <input type="search" bind:value={search} placeholder="School name or city" /></label>
		<form method="POST" action="?/addSchool" use:enhance={() => async ({ update, result }) => { await update(); if (result.type === 'success') schoolDialog.close(); }}>
			<input type="hidden" name="mode" value="existing" />
			<div class="school-options">{#each matchingSchools as school}<label class="school-option"><input type="radio" name="schoolId" value={school.id} disabled={!!school.assignedTo} required /> <span>{school.name} · {school.city} · Division {school.division}{#if school.assignedTo}<small>Already assigned to {school.assignedTo}. Contact the administrator to arrange a transfer.</small>{/if}</span></label>{:else}<p>No matching schools.</p>{/each}</div>
			<button type="submit">Add selected school</button>
		</form>
		<button type="button" class="create-toggle" onclick={() => createSchool = !createSchool}>{createSchool ? 'Cancel new school' : 'School missing? Create and add'}</button>
		{#if createSchool}<form class="new-school" method="POST" action="?/addSchool" use:enhance={() => async ({ update, result }) => { await update(); if (result.type === 'success') schoolDialog.close(); }}>
			<input type="hidden" name="mode" value="create" />
			<label>School name <input name="name" required /></label><label>City <input name="city" required /></label><label>Division <select name="division" required><option value="1">Division 1</option><option value="2">Division 2</option></select></label><button type="submit">Create and add school</button>
		</form>{/if}
	</dialog>
</main>
<style>
	button { font:inherit; padding:.5rem .7rem; border:1px solid #aeb6c2; border-radius:4px; cursor:pointer; background:#f5f7fb; } td form { margin-top:.6rem; }
	.section-heading { display:flex; align-items:center; justify-content:space-between; gap:1rem; } dialog { width:min(640px, 90vw); max-height:85vh; border:1px solid #aeb6c2; border-radius:8px; padding:1.2rem; } dialog::backdrop { background:#0006; } dialog .section-heading { align-items:flex-start; } dialog .section-heading button { flex-shrink:0; white-space:nowrap; } dialog h2 { min-width:0; margin-top:0; } dialog label:not(.school-option) { display:flex; flex-direction:column; gap:.4rem; } input, select { font:inherit; padding:.5rem; } .school-options { max-height:35vh; overflow:auto; margin:1rem 0; } .school-option { display:flex; gap:.6rem; align-items:baseline; padding:.65rem 0; border-bottom:1px solid #ddd; } small { display:block; color:#596273; } .new-school { display:grid; gap:.8rem; } .create-toggle { margin:1rem 0; } .status { display:inline-block; padding:.2rem .4rem; border-radius:4px; background:#edf0f4; white-space:nowrap; } .valid { color:#176b35; background:#e2f5e8; } .attention { color:#8a4400; background:#fff0ce; }
	main { max-width: 1100px; margin: 0 auto; padding: 1rem; overflow-wrap: anywhere; }
	h1 { margin-bottom: .25rem; }.subheading, .muted { color: #596273; }
	nav { display: flex; flex-wrap: wrap; gap: 1rem; padding: .8rem 0; }
	section { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
	.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: .7rem; }
	.summary div { display: flex; flex-direction: column; padding: .8rem; background: #eef3ff; border-radius: 6px; }.summary strong { font-size: 1.35rem; }
	.table-wrap { overflow-x: auto; } table { width: 100%; border-collapse: collapse; min-width: 680px; } th, td { text-align: left; vertical-align: top; padding: .6rem; border-bottom: 1px solid #e5e7eb; } th { background: #f5f7fb; }
	.entries { overflow-wrap: normal; }
	.entries th, .entries td { white-space: nowrap; }
	.entries td:nth-child(5) { white-space: normal; min-width: 16rem; }
	ul { margin: 0; padding-left: 1.2rem; }
	.error, .success { padding: .6rem; border-radius: 4px; }.error { background: #fbe3e3; color: #9a2020; }.success { background: #e2f5e8; color: #176b35; }
</style>
