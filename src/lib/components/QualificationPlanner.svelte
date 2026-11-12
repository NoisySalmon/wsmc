<script lang="ts">
	import { enhance } from '$app/forms';
	import { eventDivisions, usesDivisions } from '$lib/events';
	import { readCutoffThresholds, summarizePlan, type CutoffCategory, type CutoffThresholds, type PlanningData } from '$lib/qualification';
	let { planning, savedThresholds }: { planning: PlanningData; savedThresholds: string | null } = $props();
	const categories: { key: CutoffCategory; label: string; fields: [string, string]; unit: string }[] = [
		{ key: 'project', label: 'Project', unit: 'projects', fields: ['projectCutoff', 'projectCutoff'] },
		{ key: 'team_contest', label: 'Team Contest', unit: 'teams', fields: ['teamContestDivision1', 'teamContestDivision2'] },
		{ key: 'topical_team', label: 'Topical Team', unit: 'teams', fields: ['topicalTeamDivision1', 'topicalTeamDivision2'] },
		{ key: 'topical_individual', label: 'Topical Individual', unit: 'individual entries', fields: ['topicalIndividualCutoff', 'topicalIndividualCutoff'] },
	];
	const empty = (): CutoffThresholds => ({ project: null, team_contest: { 1: null, 2: null }, topical_team: { 1: null, 2: null }, topical_individual: null });
	function initial(): CutoffThresholds {
		try { if (savedThresholds) return readCutoffThresholds(savedThresholds).thresholds; } catch { /* Start a new draft with Project enabled. */ }
		return { ...empty(), project: 0 };
	}
	let thresholds = $state(initial());
	let busy = $state(false);
	const plan = $derived(summarizePlan(planning, thresholds));
	const legacyReview = $derived(savedThresholds ? readCutoffThresholds(savedThresholds).needsReview : false);
	const changed = $derived(JSON.stringify(thresholds) !== savedThresholds);
	const valid = $derived(Object.values(thresholds).flatMap(value => value !== null && typeof value === 'object' ? Object.values(value) : [value]).every(value => value === null || (Number.isFinite(value) && value >= 0)));
	function cutoff(key: CutoffCategory, division?: 1 | 2) {
		return key === 'team_contest' || key === 'topical_team' ? thresholds[key][division!] : thresholds[key];
	}
	function change(key: CutoffCategory, division: 1 | 2 | undefined, raw: string) {
		const value = raw === '' ? null : Number(raw);
		if (key === 'team_contest' || key === 'topical_team') thresholds[key][division!] = value;
		else thresholds[key] = value;
	}
</script>

<section class="planner" aria-labelledby="planner-title">
	<h2 id="planner-title">Qualification draft</h2>
	<p>Start with automatic regional qualifiers, then add entries meeting a statewide score cutoff. Team Contest and Topical Team qualify regional first place in each division, including ties; other teams need the score cutoff. Adjust any score to see the impact immediately. Saving includes automatic qualifiers and cutoff additions in one draft. Save and review the draft, then publish the saved list when ready.</p>
	<p class="coverage"><strong>{planning.finalized} of {planning.total} regionals finalized</strong> · Only finalized, rankable results are included. Missing scores, unresolved identities, and unfinalized contests can undercount invitations.</p>

	<!-- Legacy unequal cutoffs must be reviewed before saving. -->
	{#if legacyReview}<p role="alert">This saved draft has different division cutoffs for an event that has no divisions. Its combined cutoff is blank; choose a cutoff before saving.</p>{/if}
	<form method="POST" action="?/save" use:enhance={() => { busy = true; return async ({update}) => { try { await update({reset: false}); } finally { busy = false; } }; }}>
		<div class="scroll"><table><thead><tr><th>Event / division</th><th>Minimum score</th><th>Automatic entries</th><th>Added entries</th><th>Eligible entries</th></tr></thead><tbody>
		{#each categories as category}{#each eventDivisions(category.key) as division}
			{@const counts = plan.eventSummaries[`${category.key}:${division ?? 'all'}`]}
			<tr><th scope="row"><label for={category.fields[(division ?? 1) - 1]}>{category.label}{#if division}{' '}D{division}{/if}</label></th><td><input id={category.fields[(division ?? 1) - 1]} name={category.fields[(division ?? 1) - 1]} type="number" min="0" step="any" placeholder="Off" value={cutoff(category.key, division) ?? ''} oninput={event => change(category.key, division, event.currentTarget.value)} /></td><td>{counts.automaticEntries} {category.unit}<small class="population">{counts.automaticStudents} unique students</small></td><td>+{counts.cutoffEntries} {category.unit}<small class="population">{counts.cutoffStudents} unique students</small></td><td>{counts.totalEntries} {category.unit}<small class="population">{counts.students} unique students</small></td></tr>
		{/each}{/each}
		{#each [plan.eventSummaries['knowdown:all']] as counts}
			<tr><th scope="row">Knowdown</th><td>Placement only</td><td>{counts.automaticEntries} individual entries<small class="population">{counts.automaticStudents} unique students</small></td><td>—</td><td>{counts.totalEntries} individual entries<small class="population">{counts.students} unique students</small></td></tr>
		{/each}
		</tbody></table></div>
		<p class="hint">Each cell shows event entries and the unique students in those entries. A Project or team entry expands to its known regional members. Students may appear in both automatic and added entries, and in several events, so student counts do not add up across columns or rows. The population below counts each student once across all events, including Knowdown. Counts use known regional members; state teams may substitute students and attendance is not yet known. Manual exceptions are applied when saving.</p>
		<p class="hint">Scores equal to the cutoff qualify, including all ties. Blank disables that cutoff; zero includes all scored entries. Automatic qualifiers remain eligible below a cutoff. Project defaults to 0 to include every scored Project; Projects missing a score need review. Knowdown uses placement rules only.</p>
		<div class="summary" aria-live="polite">
			<p><strong>{plan.automaticStudents}</strong> unique students in automatic entries <span>({plan.automaticEntries} entries, including Project and Knowdown)</span></p>
			<p><strong>+{plan.addedStudents}</strong> new unique students from cutoffs <span>({plan.additions.length} additional event entries)</span></p>
			<p><strong>{plan.students}</strong> total unique students <span>({plan.eligibleEntries} eligible event entries)</span></p>
		</div>
		{#if !valid}<p role="alert">Use non-negative finite scores or leave a cutoff blank.</p>{/if}
		<p class="hint">{changed ? 'Exploring unsaved cutoffs.' : 'Showing saved cutoffs.'} Saving refreshes the complete qualification draft.</p>
		<button class="primary" type="submit" disabled={busy || !valid || !planning.finalized}>{busy ? 'Saving…' : 'Save draft'}</button>
		<p class="hint">The saved draft stays editable until publication. Publishing locks the saved list and opens state registration.</p>
	</form>
	<details><summary>Review {plan.additions.length} proposed entry additions</summary><ul>{#each plan.additions as row}<li>{row.schoolName} · {row.studentName ?? `Team ${row.entryNumber ?? '—'}`} · {categories.find(category => category.key === row.category)?.label}{#if usesDivisions(row.category)}{' '}D{row.division}{/if} · {row.score} ≥ {row.threshold}<br /><small>{planning.members.filter(member => member.entryId === row.entryId).map(member => member.studentName ?? 'Unknown student').join(', ') || 'No student names recorded'}</small></li>{/each}</ul></details>
</section>
<style>
	.planner { border:1px solid #cbd5e1; border-radius:10px; padding:1.25rem; margin:1.5rem 0; background:#f8fafc; }
	h2 { margin-top:0; } p { line-height:1.5; } .coverage { padding:.8rem; background:#eaf0fa; border-radius:5px; }
	button,input { font:inherit; padding:.6rem; min-height:2.75rem; box-sizing:border-box; border:1px solid #aeb6c2; border-radius:4px; } button { cursor:pointer; background:white; color:#182b55; } button:disabled { opacity:.5; cursor:default; } .primary { background:#182b55; color:white; border:0; }
	.hint { color:#526174; font-size:.9rem; }
	.scroll { overflow-x:auto; } table { border-collapse:collapse; width:100%; } th,td { text-align:left; border-bottom:1px solid #dce1e8; padding:.65rem; } thead th { font-size:.85rem; } td input { width:7rem; background:white; } tbody th { font-weight:500; } .population { display:block; margin-top:.3rem; color:#526174; font-size:.8rem; white-space:nowrap; }
	.summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:.75rem; margin:1rem 0; } .summary p { margin:0; padding:1rem; background:white; border:1px solid #dce1e8; border-radius:6px; } .summary strong { display:block; font-size:1.8rem; color:#182b55; } .summary span { display:block; color:#526174; font-size:.85rem; }
	details { margin-top:1rem; } summary { cursor:pointer; font-weight:600; } li { margin:.7rem 0; } small { overflow-wrap:anywhere; }
</style>
