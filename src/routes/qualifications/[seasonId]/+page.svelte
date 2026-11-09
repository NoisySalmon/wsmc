<script lang="ts">
	import { enhance } from '$app/forms';
	import QualificationPlanner from '$lib/components/QualificationPlanner.svelte';
	let { data, form } = $props();
	const labels: Record<string, string> = { project: 'Project', team_contest: 'Team Contest', topical_team: 'Topical Team', topical_individual: 'Topical Individual', knowdown: 'Knowdown' };
	const names = (entryId: string) => data.planning.members.filter(member => member.entryId === entryId).map(member => member.studentName).join(', ') || 'No student names recorded';
	const status = $derived(data.workflow.status);
	const savedEntries = $derived(new Set(data.qualifications.filter(row => row.active).map(row => row.entryId)));
	const savedStudents = $derived(new Set(data.planning.members.filter(member => savedEntries.has(member.entryId)).map(member => member.studentId)));
</script>
<svelte:head><title>{data.season.year} qualifications — WSMC</title></svelte:head>
<main>
	<p><a href="/">← Home</a></p><h1>{data.season.year} qualifications</h1>
	<ol aria-label="Qualification steps"><li class:current={status === 'draft'}>1. Edit draft</li><li class:current={status === 'frozen'}>2. Freeze and review</li><li class:current={status === 'published'}>3. Publish and open state</li></ol>
	<p>Automatic regional placements and statewide score cutoffs form one qualification list. Save as often as needed. Freeze the complete draft when satisfied; publish it when ready to make the decisions available for state registration.</p>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}
	{#if status === 'draft' && ['regional', 'qualifications'].includes(data.season.status)}
		{#key data.season.id}<QualificationPlanner planning={data.planning} savedThresholds={data.workflow.thresholdsJson} canFreeze={data.season.status === 'qualifications' && data.planning.finalized === data.planning.total && data.planning.total > 0} />{/key}
		<details><summary>Manual exceptions</summary><p>Record an include/exclude decision with a reason. Save the draft afterward to apply exceptions alongside placements and cutoffs.</p>
			<form method="POST" action="?/manualDecision" use:enhance><label>Entry<select name="entryId" required>{#each data.planning.rows as row}<option value={row.entryId}>{labels[row.category]} D{row.division} · {row.schoolName} · {names(row.entryId)}</option>{/each}</select></label><label>Decision<select name="decision"><option value="include">Include</option><option value="exclude">Exclude</option></select></label><label>Reason<input name="reason" required /></label><button>Record exception</button></form>
		</details>
	{:else if status === 'frozen'}
		<section><h2>Qualifications frozen</h2><p>The saved list below is locked and has not yet been published. Publishing makes these qualifications available for state registration and moves the season to the state contest stage.</p>
			<form method="POST" action="?/publish" use:enhance><button>Publish qualifications and open state contest</button></form>
		</section>
	{:else if status === 'published'}<p class="success">Qualifications are published and locked.</p>{/if}
	<section><h2>{status === 'draft' ? 'Saved draft' : 'Qualification list'}</h2>
		{#if data.qualifications.length}<p>{savedEntries.size} qualified event entries representing {savedStudents.size} unique known students. Students may qualify through more than one event.</p><div class="scroll"><table><thead><tr><th>Event</th><th>School</th><th>Entry</th><th>Students</th><th>Decision</th><th>Basis</th></tr></thead><tbody>
		{#each data.qualifications as row}<tr><td>{labels[row.category]} D{row.division}</td><td>{row.schoolName}</td><td>{row.entryNumber ?? 'Individual'}</td><td>{names(row.entryId)}</td><td>{row.active ? 'Qualified' : row.category === 'knowdown' ? 'Alternate / excluded' : 'Excluded'}</td><td>{row.reasons.map(reason => reason.kind === 'state_cutoff' ? `Score ≥ ${reason.threshold}` : reason.kind === 'regional_placement' ? `Regional ${reason.scope === 'actual_grade' ? 'grade ' : ''}place ${reason.rank}` : reason.kind === 'knowdown_alternate' ? 'Knowdown alternate' : 'Manual exception').join('; ')}</td></tr>{/each}
		</tbody></table></div>{:else}<p>No qualification list saved yet. Saving the draft includes all automatic qualifiers and cutoff additions together.</p>{/if}
	</section>
</main>
<style>
	main { max-width:1100px; margin:auto; padding:1rem; } p { line-height:1.5; } ol { display:flex; flex-wrap:wrap; gap:1rem; list-style:none; padding:0; color:#526174; } .current { font-weight:700; color:#182b55; } section,details { margin-top:1.5rem; } summary { cursor:pointer; font-weight:600; } form { display:flex; flex-wrap:wrap; align-items:end; gap:.7rem; } label { display:flex; flex-direction:column; gap:.3rem; max-width:100%; } input,select,button { min-height:2.75rem; font:inherit; padding:.6rem; max-width:100%; box-sizing:border-box; } button { background:#182b55; color:white; border:0; border-radius:4px; cursor:pointer; } .scroll { overflow-x:auto; } table { border-collapse:collapse; width:100%; } th,td { padding:.6rem; border-bottom:1px solid #ddd; text-align:left; vertical-align:top; } .error,.success { padding:.8rem; border-radius:5px; } .error { background:#fbe3e3; color:#9a2020; } .success { background:#e2f5e8; color:#176b35; }
</style>
