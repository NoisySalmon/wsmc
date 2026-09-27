<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>{data.contest.name} overview — WSMC</title></svelte:head>
<main>
	<p><a href="/participation">← Participation</a></p>
	<h1>{data.contest.name}</h1>
	<p class="subheading">Regional contest · {data.contest.lifecycle}{#if data.contest.resultsPublishedAt} · results published{/if}</p>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}
	<nav aria-label="Contest tools"><a href="/participation">Participation</a>{#if ['roster_locked', 'scoring', 'finalized'].includes(data.contest.lifecycle)}<a href="/scoring/{data.contest.id}">Scoring</a>{/if}{#if data.contest.lifecycle === 'finalized'}<a href="/results/{data.contest.id}">Results</a>{/if}{#if data.canManageStaff}<a href="/contests/{data.contest.id}/staff">Manage scorekeepers</a>{/if}</nav>
	{#if data.canAdvanceLifecycle && ['registration_open', 'roster_locked'].includes(data.contest.lifecycle)}
		<section class="stage"><h2>Contest stage</h2><p>{data.contest.lifecycle === 'registration_open' ? 'Registration is open. Lock rosters when schools are ready for scoring.' : 'Rosters are locked. Start scoring when the contest is ready.'}</p>
			<form method="POST" action="?/advanceLifecycle"><input type="hidden" name="lifecycle" value={data.contest.lifecycle === 'registration_open' ? 'roster_locked' : 'scoring'} /><button type="submit">{data.contest.lifecycle === 'registration_open' ? 'Lock rosters' : 'Start scoring'}</button></form>
		</section>
	{/if}

	<section class="summary" aria-label="Contest summary">
		<div><strong>{data.acceptedSchoolCount}</strong><span>accepted schools</span></div>
		<div><strong>{data.invitedSchoolCount}</strong><span>invited or pending</span></div>
		<div><strong>{data.declinedSchoolCount}</strong><span>declined schools</span></div>
		<div><strong>{data.rosteredStudentCount}</strong><span>distinct rostered students</span></div>
		<div><strong>{data.entries.length}</strong><span>competition entries</span></div>
		<div><strong>{data.completedEntryCount} / {data.entries.length}</strong><span>entries with complete results</span></div>
	</section>

	<section><h2>School participation and rosters</h2>
		{#if data.schools.length}
			<div class="table-wrap"><table><thead><tr><th>School</th><th>Division</th><th>Response</th><th>Rostered students</th><th>School registration</th></tr></thead><tbody>
			{#each data.schools as school}
				<tr><td>{school.name}</td><td>Division {school.division}</td><td>{school.status}</td><td>{#if school.students.length}<ul>{#each school.students as student}<li>{student.studentName} (grade {student.actualGrade})</li>{/each}</ul>{:else}<span class="muted">No students rostered</span>{/if}</td><td><a href="/registration/{data.contest.id}/{school.id}">Open registration</a></td></tr>
			{/each}
			</tbody></table></div>
		{:else}<p class="muted">No schools have been invited to this contest.</p>{/if}
	</section>

	<section><h2>Entry and scoring coverage</h2><p class="muted">Knowdown outcomes record each entrant as placed or eliminated; places 1 through 4 are unique across the contest.</p><div class="table-wrap"><table><thead><tr><th>Category</th><th>Entries</th><th>Complete results</th><th>Missing</th></tr></thead><tbody>
		{#each data.categoryCoverage as row}<tr><td>{row.label}</td><td>{row.total}</td><td>{row.complete}</td><td>{row.total - row.complete}</td></tr>{/each}
		</tbody></table></div></section>

	<section><h2>Registered entries</h2>
		{#if data.entries.length}<div class="table-wrap"><table><thead><tr><th>Category</th><th>Division</th><th>School</th><th>Entry</th><th>Participants</th><th>Result</th></tr></thead><tbody>
		{#each data.entries as entry}
			<tr><td>{entry.categoryLabel}</td><td>Division {entry.division}</td><td>{entry.schoolName}</td><td>{entry.entryNumber ?? '—'}</td><td>{entry.members.map((member) => `${member.studentName} (grade ${member.actualGrade}${member.competingGrade ? `, competing ${member.competingGrade}` : ''})`).join(', ') || 'No participants listed'}</td><td>{entry.complete ? 'Complete' : 'Missing'}</td></tr>
		{/each}
		</tbody></table></div>{:else}<p class="muted">No competition entries have been registered.</p>{/if}
	</section>
</main>
<style>
	main { max-width: 1100px; margin: 0 auto; padding: 1rem; overflow-wrap: anywhere; }
	h1 { margin-bottom: .25rem; }.subheading, .muted { color: #596273; }
	nav { display: flex; flex-wrap: wrap; gap: 1rem; padding: .8rem 0; }
	section { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
	.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: .7rem; }
	.summary div { display: flex; flex-direction: column; padding: .8rem; background: #eef3ff; border-radius: 6px; }.summary strong { font-size: 1.35rem; }
	.table-wrap { overflow-x: auto; } table { width: 100%; border-collapse: collapse; min-width: 680px; } th, td { text-align: left; vertical-align: top; padding: .6rem; border-bottom: 1px solid #e5e7eb; } th { background: #f5f7fb; }
	ul { margin: 0; padding-left: 1.2rem; }
	.stage form { margin: .5rem 0; }.stage button { min-height: 2.75rem; padding: .55rem .8rem; border: 0; border-radius: 4px; background: #1a1a2e; color: #fff; cursor: pointer; }
	.error, .success { padding: .6rem; border-radius: 4px; }.error { background: #fbe3e3; color: #9a2020; }.success { background: #e2f5e8; color: #176b35; }
</style>
