<script lang="ts">
	import { eventDivisions, usesDivisions } from '$lib/events';
	import { enhance } from '$app/forms';
	import QualificationPlanner from '$lib/components/QualificationPlanner.svelte';
	let { data, form } = $props();
	const labels: Record<string, string> = { project: 'Project', team_contest: 'Team Contest', topical_team: 'Topical Team', topical_individual: 'Topical Individual', knowdown: 'Knowdown' };
	const names = (entryId: string) => data.planning.members.filter(member => member.entryId === entryId).map(member => member.studentName).join(', ') || 'No student names recorded';
	type Qualification = typeof data.qualifications[number];
	const eventOrder = ['project', 'knowdown', 'team_contest', 'topical_team', 'topical_individual'];
	const gradeLabels: Record<number, string> = { 12: 'Seniors', 11: 'Juniors', 10: 'Sophomores', 9: 'Freshmen' };
	function basisOrder(row: Qualification): [number, number] {
		return row.reasons.map((reason): [number, number] => {
			if (reason.kind === 'regional_placement') return [reason.scope === 'actual_grade' ? 1 : 0, reason.rank ?? 0];
			if (reason.kind === 'state_cutoff') return [2, 0];
			if (reason.kind === 'knowdown_alternate') return [3, 0];
			return [4, 0];
		}).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0] ?? [5, 0];
	}
	function compareRows(a: Qualification, b: Qualification) {
		const aBasis = basisOrder(a), bBasis = basisOrder(b);
		return (a.regionNumber ?? Infinity) - (b.regionNumber ?? Infinity)
			|| aBasis[0] - bBasis[0] || aBasis[1] - bBasis[1]
			|| a.schoolName.localeCompare(b.schoolName) || names(a.entryId).localeCompare(names(b.entryId)) || a.id.localeCompare(b.id);
	}
	const savedGroups = $derived(eventOrder.map(category => ({
		category,
		sections: eventDivisions(category).flatMap(division => {
			const rows = data.qualifications.filter(row => row.category === category && (division === undefined || row.division === division)).sort(compareRows);
			if (category === 'topical_individual') {
				return [12, 11, 10, 9, null].map(grade => ({
					title: grade === null ? 'Grade not recorded' : gradeLabels[grade],
					rows: rows.filter(row => row.actualGrade === grade),
				})).filter(section => section.rows.length);
			}
			return rows.length ? [{ title: division ? `Division ${division}` : '', rows }] : [];
		}),
	})).filter(group => group.sections.length));
	function decision(row: Qualification) {
		if (row.active) return 'Qualified';
		return row.reasons.some(reason => reason.kind === 'knowdown_alternate') && !row.reasons.some(reason => reason.kind === 'manual_exclude') ? 'Alternate' : 'Excluded';
	}
	function basis(reason: Qualification['reasons'][number], category: string) {
		if (reason.kind === 'state_cutoff') return `Score ≥ ${reason.threshold}`;
		if (reason.kind === 'regional_placement') {
			if (reason.scope === 'actual_grade') {
				const gradeNames: Record<number, string> = { 9: 'freshman', 10: 'sophomore', 11: 'junior', 12: 'senior' };
				return reason.rank === 1 ? `Distinguished ${gradeNames[reason.actualGrade!] ?? `grade ${reason.actualGrade}`}` : `Regional grade ${reason.actualGrade} place ${reason.rank}`;
			}
			if (category === 'topical_individual') return `Regional overall place ${reason.rank}`;
			return `Regional place ${reason.rank}`;
		}
		if (reason.kind === 'knowdown_alternate') return 'Regional alternate';
		let detail = '';
		try { detail = JSON.parse(reason.detailJson).reason || ''; } catch { /* Older decisions may lack a written reason. */ }
		return `Manual ${reason.kind === 'manual_include' ? 'inclusion' : 'exclusion'}${detail ? `: ${detail}` : ''}`;
	}
	const status = $derived(data.workflow.status);
	const savedEntries = $derived(new Set(data.qualifications.filter(row => row.active).map(row => row.entryId)));
	const savedStudents = $derived(new Set(data.planning.members.filter(member => savedEntries.has(member.entryId)).map(member => member.studentId)));
</script>
<svelte:head><title>{data.season.year} qualifications — WSMC</title></svelte:head>
<main>
	<p><a href="/">← Home</a></p><h1>{data.season.year} qualifications</h1>
	<ol aria-label="Qualification steps"><li class:current={status === 'draft'}>1. Edit draft</li><li class:current={status === 'published'}>2. Publish and open state</li></ol>
	<p>Automatic regional placements and statewide score cutoffs form one qualification list. Save as often as needed. Review the saved draft, then publish it when ready. Publishing locks the list and opens state registration.</p>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}
	{#if status === 'draft' && ['regional', 'qualifications'].includes(data.season.status)}
		{#key data.season.id}<QualificationPlanner planning={data.planning} savedThresholds={data.workflow.thresholdsJson} />{/key}
		<details><summary>Manual exceptions</summary><p>Record an include/exclude decision with a reason. Save the draft afterward to apply exceptions alongside placements and cutoffs.</p>
			<form method="POST" action="?/manualDecision" use:enhance><label>Entry<select name="entryId" required>{#each data.planning.rows as row}<option value={row.entryId}>{labels[row.category]}{#if usesDivisions(row.category)}{' '}D{row.division}{/if} · {row.schoolName} · {names(row.entryId)}</option>{/each}</select></label><label>Decision<select name="decision"><option value="include">Include</option><option value="exclude">Exclude</option></select></label><label>Reason<input name="reason" required /></label><button>Record exception</button></form>
		</details>

	{:else if status === 'published'}<p class="success">Qualifications are published and locked.</p>{/if}
	<section><h2>{status === 'draft' ? 'Saved draft' : 'Qualification list'}</h2>
		{#if data.qualifications.length}
			<p>{savedEntries.size} qualified event entries representing {savedStudents.size} unique known students. Students may qualify through more than one event.</p>
			{#if status === 'draft' && ['regional', 'qualifications'].includes(data.season.status)}
				<p>Publish the saved list below when your review is complete. Save any cutoff changes or manual exceptions first. Publication locks the list and opens state registration.</p>
				<form method="POST" action="?/publish" use:enhance><button disabled={data.season.status !== 'qualifications' || data.planning.finalized !== data.planning.total || !data.planning.total}>Publish qualifications and open state contest</button></form>
				{#if data.season.status !== 'qualifications' || data.planning.finalized !== data.planning.total}<p>Finalize all regionals and begin the qualification stage before publishing.</p>{/if}
			{/if}
			{#each savedGroups as group}
				<section class="event-group" aria-label={labels[group.category]}>
					<h3>{labels[group.category]}</h3>
					{#if group.category === 'topical_individual'}<p>The regional top three qualify overall. After removing those students, the highest remaining scorer in each grade qualifies as distinguished. Ties qualify together. Remaining entries may qualify by score cutoff.</p>{/if}
					{#each group.sections as section}
						{#if section.title}<h4>{section.title}</h4>{/if}
						<div class="scroll"><table>
							<caption class="sr-only">{labels[group.category]}{section.title ? ` — ${section.title}` : ''} qualifications</caption>
							<thead><tr><th scope="col">Region</th><th scope="col">School</th><th scope="col">Student(s)</th><th scope="col">{group.category === 'knowdown' ? 'Decision' : 'Score'}</th><th scope="col">Basis</th></tr></thead>
							<tbody>{#each section.rows as row}
								<tr><td class="region">{row.regionName === 'Virtual' ? 'Virtual' : row.regionNumber ?? '—'}</td><td class="school">{row.schoolName}</td><td class="students">{names(row.entryId)}</td><td class="decision">{group.category === 'knowdown' ? decision(row) : row.score ?? '—'}</td><td class="basis">{#if !row.active && group.category !== 'knowdown'}<strong>Excluded</strong>{/if}<ul>{#each row.reasons as reason}<li>{basis(reason, row.category)}</li>{/each}</ul></td></tr>
							{/each}</tbody>
						</table></div>
					{/each}
				</section>
			{/each}
		{:else}<p>No qualification list saved yet. Saving the draft includes all automatic qualifiers and cutoff additions together.</p>{/if}
	</section>
</main>
<style>
	main { max-width:1100px; margin:auto; padding:1rem; } p { line-height:1.5; } ol { display:flex; flex-wrap:wrap; gap:1rem; list-style:none; padding:0; color:#526174; } .current { font-weight:700; color:#182b55; } section,details { margin-top:1.5rem; } summary { cursor:pointer; font-weight:600; } form { display:flex; flex-wrap:wrap; align-items:end; gap:.7rem; } label { display:flex; flex-direction:column; gap:.3rem; max-width:100%; } input,select,button { min-height:2.75rem; font:inherit; padding:.6rem; max-width:100%; box-sizing:border-box; } button:disabled { opacity:.5; cursor:default; } button { background:#182b55; color:white; border:0; border-radius:4px; cursor:pointer; } .scroll { overflow-x:auto; } table { border-collapse:collapse; width:100%; } th,td { padding:.6rem; border-bottom:1px solid #ddd; text-align:left; vertical-align:top; } .error,.success { padding:.8rem; border-radius:5px; } .error { background:#fbe3e3; color:#9a2020; } .success { background:#e2f5e8; color:#176b35; }
	.event-group { border-top:1px solid #cbd5e1; padding-top:1rem; margin-top:2rem; }
	h3 { margin:0 0 .8rem; color:#182b55; font-size:1.2rem; } h4 { margin:1.2rem 0 .5rem; }
	thead th { background:#f1f5f9; font-size:.85rem; } table { table-layout:fixed; min-width:760px; }
	th:nth-child(1) { width:7%; } th:nth-child(2) { width:18%; } th:nth-child(3) { width:36%; } th:nth-child(4) { width:12%; } th:nth-child(5) { width:27%; }
	.school,.students,.basis { overflow-wrap:anywhere; } .region,.decision { white-space:nowrap; }
	.basis ul { list-style:none; margin:0; padding:0; } .basis li + li { margin-top:.35rem; }
	.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
</style>
