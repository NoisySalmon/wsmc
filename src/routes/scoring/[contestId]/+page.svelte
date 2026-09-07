<script lang="ts">
	let { data, form } = $props();
	let categoryFilter = $state('all');
	let divisionFilter = $state('all');
	let missingOnly = $state(false);
	type ScoreCsvForm = { scoreCsvSummary?: { rows: unknown[]; updatedRows: number; clearedRows: number }; scoreCsvErrors?: { rowNumber: number; field: string; message: string }[] };
	let scoreCsvForm = $derived(form as ScoreCsvForm | null | undefined);

	const labels: Record<string, string> = {
		project: 'Project', team_contest: 'Team Contest', topical_team: 'Topical Team', topical_individual: 'Topical Individual', knowdown: 'Knowdown'
	};

	function label(category: string) { return labels[category] ?? category; }
	function missing(entry: typeof data.entries[number]) {
		if (entry.category === 'topical_team' || entry.category === 'topical_individual') return entry.part1 === null || entry.part2 === null;
		if (entry.category === 'knowdown') return entry.placement === null;
		return entry.score === null;
	}
	function visible(entry: typeof data.entries[number]) {
		return (categoryFilter === 'all' || entry.category === categoryFilter)
			&& (divisionFilter === 'all' || String(entry.division) === divisionFilter)
			&& (!missingOnly || missing(entry));
	}
	function displayScore(value: number | null) { return value === null ? '—' : String(value); }
</script>

<svelte:head><title>{data.contest.name} scoring — WSMC</title></svelte:head>

<main>
	<p><a href="/participation">← Program</a></p>
	<h1>{data.contest.name}</h1>
	<p class="subheading">{data.contest.kind} · {data.contest.lifecycle}{#if data.contest.resultsPublishedAt} · published{/if}</p>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
	{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}

	<section class="summary" aria-label="Scoring completeness">
		<strong>{data.finalization.missing.length === 0 ? 'Complete' : `${data.finalization.missing.length} missing result${data.finalization.missing.length === 1 ? '' : 's'}`}</strong>
		<span>Blank fields are missing. A score of 0 is an entered score.</span>
	</section>

	<section class="filters" aria-label="Score filters">
		<label>Category <select bind:value={categoryFilter}><option value="all">All categories</option>{#each Object.entries(labels) as [value, name]}<option {value}>{name}</option>{/each}</select></label>
		<label>Division <select bind:value={divisionFilter}><option value="all">All divisions</option><option value="1">Division 1</option><option value="2">Division 2</option></select></label>
		<label class="checkbox"><input type="checkbox" bind:checked={missingOnly} /> Missing only</label>
	</section>

	<section class="score-list" aria-label="Score entry table">
		{#each data.entries.filter(visible) as entry}
			<article class:missing={missing(entry)} class="score-card">
				<header><div><strong>{label(entry.category)}</strong><span>{entry.schoolName} · Division {entry.division}{#if entry.entryNumber} · Entry {entry.entryNumber}{/if}</span><small>{entry.members.map((member) => member.name).join(', ') || 'No named members'}</small></div><span class="state">{missing(entry) ? 'Missing' : 'Entered'}</span></header>
				<form method="POST" action="?/saveResult">
					<input type="hidden" name="entryId" value={entry.id} /><input type="hidden" name="expectedVersion" value={entry.version} />
					{#if entry.category === 'topical_team' || entry.category === 'topical_individual'}
						<label>Part 1 <input aria-label="{label(entry.category)} Part 1" name="part1" type="number" min="0" max="75" step="any" value={entry.part1 ?? ''} /></label><label>Part 2 <input aria-label="{label(entry.category)} Part 2" name="part2" type="number" min="0" max="75" step="any" value={entry.part2 ?? ''} /></label><output>Total {entry.score === null ? '—' : entry.score}</output>
					{:else if entry.category === 'knowdown'}
						<label>Placement <input aria-label="Knowdown placement" name="placement" type="number" min="1" max="4" step="1" value={entry.placement ?? ''} /></label>
					{:else}
						<label>Score <input aria-label="{label(entry.category)} score" name="score" type="number" min="0" step="any" value={entry.score ?? ''} /></label>
					{/if}
					<button type="submit" disabled={data.contest.lifecycle !== 'scoring'}>Save</button>
				</form>
				{#if entry.lastEditedBy}<small class="editor">Last editor: {entry.lastEditedBy} · version {entry.version}</small>{:else}<small class="editor">Not yet entered</small>{/if}
			</article>
		{:else}<p class="empty">No entries match these filters.</p>{/each}
	</section>

	{#if data.canFinalize}
		<section class="controls"><h2>Contest controls</h2>
			<p>{data.finalization.complete ? 'All entries have results and this contest can be finalized.' : 'Finalization is blocked until every entry has a result.'}</p>
			<form method="POST" action="?/finalize"><button type="submit" disabled={data.contest.lifecycle !== 'scoring' || !data.finalization.complete}>Finalize results</button></form>
			{#if data.contest.lifecycle === 'finalized'}<form method="POST" action="?/publish"><button type="submit">{data.contest.resultsPublishedAt ? 'Republish results' : 'Publish results'}</button></form><form method="POST" action="?/reopen"><label>Reason to reopen <textarea name="reason" required></textarea></label><button class="quiet" type="submit">Reopen for correction</button></form>{/if}
		</section>
	{/if}

	<section class="csv"><h2>Score CSV round trip</h2><p>Download the prefilled contest template, edit numeric scores, preview the complete file, then import it atomically. The version column rejects stale spreadsheets.</p><p><a href="/scoring/{data.contest.id}/csv">Download score CSV</a></p><div class="csv-forms">
		<form method="POST" action="?/previewCsv" enctype="multipart/form-data"><label>CSV file to preview <input type="file" name="file" accept=".csv,text/csv" required /></label><button type="submit">Preview CSV</button></form>
		<form method="POST" action="?/importCsv" enctype="multipart/form-data"><label>CSV file to import <input type="file" name="file" accept=".csv,text/csv" required /></label><button type="submit" disabled={data.contest.lifecycle !== 'scoring'}>Import CSV</button></form>
	</div>{#if scoreCsvForm?.scoreCsvSummary}<p class="success">{scoreCsvForm.scoreCsvSummary.rows.length} rows · {scoreCsvForm.scoreCsvSummary.updatedRows} changed · {scoreCsvForm.scoreCsvSummary.clearedRows} cleared.</p>{/if}{#if scoreCsvForm?.scoreCsvErrors?.length}<ul class="csv-errors">{#each scoreCsvForm.scoreCsvErrors as csvError}<li>Row {csvError.rowNumber}, {csvError.field}: {csvError.message}</li>{/each}</ul>{/if}</section>
</main>

<style>
	main { max-width: 980px; margin: 0 auto; padding: 1rem; overflow-wrap: anywhere; }
	h1 { margin-bottom: .25rem; } .subheading { color: #666; }
	section { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
	.summary { display: flex; flex-direction: column; gap: .3rem; padding: .8rem; border-radius: 6px; background: #eef3ff; } .summary span, .editor, small { color: #556; }
	.filters { display: flex; flex-wrap: wrap; align-items: end; gap: .8rem; } label { display: flex; flex-direction: column; gap: .2rem; font-weight: 600; font-size: .9rem; } .checkbox { flex-direction: row; align-items: center; min-height: 2.75rem; }
	select, input, textarea { box-sizing: border-box; min-height: 2.75rem; padding: .55rem; font: inherit; border: 1px solid #aaa; border-radius: 4px; } textarea { min-height: 5rem; } .checkbox input { min-height: auto; }
	.score-list { display: grid; gap: .7rem; } .score-card { padding: .8rem; border: 1px solid #ddd; border-left: 5px solid #2d7b45; border-radius: 6px; } .score-card.missing { border-left-color: #b56b00; }
	.score-card header { display: flex; justify-content: space-between; gap: .8rem; } header div { display: grid; gap: .15rem; } header span { color: #555; } .state { white-space: nowrap; color: #7a4a00; } .score-card:not(.missing) .state { color: #176b35; }
	.score-card form { display: flex; flex-wrap: wrap; align-items: end; gap: .7rem; margin-top: .7rem; } .score-card form label { min-width: 8rem; } output { padding-bottom: .7rem; } button { min-height: 2.75rem; padding: .55rem .8rem; border: 0; border-radius: 4px; background: #1a1a2e; color: white; cursor: pointer; } button:disabled { opacity: .5; cursor: not-allowed; } button.quiet { background: #555; }
	.editor { display: block; margin-top: .6rem; } .error, .success { padding: .7rem; border-radius: 5px; } .error { background: #fbe3e3; color: #9a2020; } .success { background: #e2f5e8; color: #176b35; } .empty { color: #666; }
	.controls form { margin: .8rem 0; } .controls textarea { display: block; width: min(100%, 30rem); margin: .3rem 0; }
	.csv-forms { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; } .csv-forms form { display: grid; gap: .6rem; padding: .8rem; border: 1px solid #ddd; border-radius: 6px; } .csv-errors { padding-left: 1.2rem; color: #9a2020; }
	@media (max-width: 620px) { .score-card header { align-items: flex-start; flex-direction: column; } .score-card form { align-items: stretch; flex-direction: column; } .score-card form label { min-width: 0; } .score-card button { width: 100%; } }
	@media (max-width: 620px) { .csv-forms { grid-template-columns: 1fr; } }
</style>
