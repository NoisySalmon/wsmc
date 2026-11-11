<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ScoreCell from '$lib/components/ScoreCell.svelte';
	let { data, form } = $props();
	let categoryFilter = $state('team_contest');
	let missingOnly = $state(false);
	let search = $state('');
	let sort = $state('schoolName');
	let descending = $state(false);
	let savingPlace = $state(false);
	let placeError = $state('');
	type Entry = typeof data.entries[number];
	const labels: Record<string, string> = { team_contest: 'Team Contest', topical_team: 'Topical Team', topical_individual: 'Topical Individual', project: 'Project', knowdown: 'Knowdown' };
	let topical = $derived(categoryFilter === 'topical_team' || categoryFilter === 'topical_individual');
	let individual = $derived(categoryFilter === 'topical_individual');
	let locked = $derived(data.contest.lifecycle !== 'scoring');
	function missing(entry: Entry) { return entry.category.startsWith('topical_') ? entry.part1 === null || entry.part2 === null : entry.score === null; }
	function names(entry: Entry) { return entry.members.map((member) => member.name).join(', '); }
	function sortValue(entry: Entry): string | number | null {
		if (sort === 'members') return names(entry);
		return entry[sort as 'schoolName' | 'entryNumber' | 'score' | 'part1' | 'part2'];
	}
	function compare(a: Entry, b: Entry) {
		const x = sortValue(a), y = sortValue(b);
		const order = x === null ? (y === null ? 0 : 1) : y === null ? -1 : typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
		return (descending ? -order : order) || a.schoolName.localeCompare(b.schoolName) || (a.entryNumber ?? 0) - (b.entryNumber ?? 0) || names(a).localeCompare(names(b));
	}
	let rows = $derived(data.entries.filter((entry) => entry.category === categoryFilter && (!missingOnly || missing(entry)) && `${entry.schoolName} ${names(entry)} ${entry.entryNumber ?? ''}`.toLowerCase().includes(search.toLowerCase())).sort(compare));
	let knowdown = $derived(data.entries.filter((entry) => entry.category === 'knowdown').sort((a, b) => a.schoolName.localeCompare(b.schoolName) || names(a).localeCompare(names(b))));
	let schools = $derived([...new Set(knowdown.map((entry) => entry.schoolName))]);
	function sortBy(field: string) { descending = sort === field ? !descending : false; sort = field; }
	function sortState(field: string) { return sort === field ? (descending ? 'descending' : 'ascending') : 'none'; }
	async function savePlace(placement: number, select: HTMLSelectElement) {
		savingPlace = true; placeError = '';
		try {
			const body = new FormData(); body.set('field', 'placement'); body.set('value', String(placement)); body.set('entryId', select.value);
			const result = deserialize(await (await fetch('?/saveCell', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } })).text());
			if (result.type !== 'success') throw new Error(result.type === 'failure' ? String(result.data?.error ?? 'Could not save place.') : 'Could not save place.');
			await invalidateAll();
		} catch (cause) { placeError = cause instanceof Error ? cause.message : 'Could not save place.'; }
		finally { select.value = knowdown.find((entry) => entry.placement === placement)?.id ?? ''; savingPlace = false; }
	}
</script>

<svelte:head><title>{data.contest.name} scoring — WSMC</title></svelte:head>

<main>
	<p><a href="/">← Home</a>{#if data.contest.kind === 'regional'} · <a href="/contests/{data.contest.id}">Contest overview</a>{/if}</p>
	<h1>{data.contest.name}</h1>
	<p class="subheading">{data.contest.kind} · {data.contest.lifecycle}{#if data.contest.resultsPublishedAt} · published{/if}{#if data.contest.lifecycle === 'finalized'} · {#if data.contest.kind === 'state'}<a href="/state/{data.contest.id}/results">View state results</a>{:else}<a href="/results/{data.contest.id}">View regional results</a>{/if} · <a href="/reports/results?contestId={data.contest.id}">Download results CSV</a>{/if}</p>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
	{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}

	<section class="summary" aria-label="Scoring completeness">
		<strong>{data.finalization.missing.length === 0 ? 'Complete' : `${data.finalization.missing.length} missing result${data.finalization.missing.length === 1 ? '' : 's'}`}</strong>
		<span>Blank scores are missing; 0 is an entered score. Unselected Knowdown students count as eliminated.</span>
		{#if data.finalization.duplicateKnowdownPlaces.length}<span class="error">Duplicate Knowdown places: {data.finalization.duplicateKnowdownPlaces.map((item) => item.placement).join(', ')}. Places must be unique.</span>{/if}
	</section>

	<nav class="categories" aria-label="Scoring category">
		{#each Object.entries(labels) as [value, name]}<button class:active={categoryFilter === value} aria-pressed={categoryFilter === value} onclick={() => { categoryFilter = value; missingOnly = false; search = ''; }}>{name}</button>{/each}
	</nav>
	<section class="entry-section" aria-label="Score entry">
		<h2>{labels[categoryFilter]}</h2>
		{#if categoryFilter === 'knowdown'}
			<p>Select the students who placed. Each selection saves immediately. All other students are eliminated.</p>
			{#if placeError}<p class="error" role="alert">{placeError} Please select the student again to retry.</p>{/if}
			{#if savingPlace}<p role="status">Saving place…</p>{/if}
			<table class="places"><thead><tr><th scope="col">Place</th><th scope="col">School / student</th></tr></thead><tbody>
				{#each [1, 2, 3, 4] as place}
					{@const selected = knowdown.find((entry) => entry.placement === place)}
					<tr><th scope="row">{['1st', '2nd', '3rd', '4th (alternate)'][place - 1]}</th><td><select aria-label={`Knowdown ${place === 4 ? '4th (alternate)' : ['1st', '2nd', '3rd'][place - 1]}`} title={selected?.lastEditedBy ? `Last saved by ${selected.lastEditedBy}` : undefined} value={selected?.id ?? ''} disabled={locked || savingPlace} onchange={(event) => void savePlace(place, event.currentTarget)}>
						<option value="">Select a student…</option>
						{#each schools as school}<optgroup label={school}>{#each knowdown.filter((entry) => entry.schoolName === school) as entry}<option value={entry.id} disabled={entry.placement !== null && entry.placement !== place}>{names(entry)} — {school}{entry.placement !== null && entry.placement !== place ? ` (${entry.placement === 4 ? 'alternate' : `place ${entry.placement}`})` : ''}</option>{/each}</optgroup>{/each}
					</select></td></tr>
				{/each}
			</tbody></table>
		{:else}
			<p id="score-help">Click a score to edit. Enter saves and moves down; Tab saves and moves across. Escape cancels. Hover over a score for its last editor.</p>
			<div class="filters"><label>Find school or student <input type="search" bind:value={search} placeholder="School, name, or team number" /></label><label class="checkbox"><input type="checkbox" bind:checked={missingOnly} /> Missing only</label><span>{rows.length} entries</span></div>
			<div class="table-scroll"><table aria-label={`${labels[categoryFilter]} scores`} aria-describedby="score-help"><thead><tr>
				<th scope="col" aria-sort={sortState('schoolName')}><button onclick={() => sortBy('schoolName')}>School {sort === 'schoolName' ? descending ? '↓' : '↑' : '↕'}</button></th>
				{#if !individual}<th scope="col" aria-sort={sortState('entryNumber')}><button onclick={() => sortBy('entryNumber')}>Team # ↕</button></th>{/if}
				<th scope="col" aria-sort={sortState('members')}><button onclick={() => sortBy('members')}>{individual ? 'Student' : 'Team members'} ↕</button></th>
				{#each topical ? ['part1', 'part2', 'score'] : ['score'] as field}<th scope="col" aria-sort={sortState(field)} class="numeric"><button onclick={() => sortBy(field)}>{field === 'part1' ? 'Part 1' : field === 'part2' ? 'Part 2' : topical ? 'Total' : 'Score'} ↕</button></th>{/each}
			</tr></thead><tbody>
				{#each rows as entry (entry.id)}<tr>
					<td>{entry.schoolName}</td>{#if !individual}<td class="team-number">{entry.entryNumber ?? '—'}</td>{/if}<td>{names(entry) || 'No named members'}</td>
					{#each topical ? ['part1', 'part2'] as const : ['score'] as const as field}<td class="numeric"><ScoreCell entryId={entry.id} {field} value={entry[field]} name={`${entry.schoolName}, ${individual ? names(entry) : `team ${entry.entryNumber}`}, ${field === 'part1' ? 'Part 1' : field === 'part2' ? 'Part 2' : 'Score'}`} editor={entry.lastEditedBy} updatedAt={entry.updatedAt} disabled={locked} max={topical ? 75 : undefined} /></td>{/each}
					{#if topical}<td class="numeric total">{entry.score ?? '—'}</td>{/if}
				</tr>{:else}<tr><td colspan={individual ? 5 : topical ? 6 : 4} class="empty">No entries match.</td></tr>{/each}
			</tbody></table></div>
		{/if}
	</section>

	{#if data.canFinalize}
		<section class="controls"><h2>Contest controls</h2>
			<p>{data.finalization.complete ? 'All required scores are entered. Confirm the Knowdown places before finalizing.' : 'Finalization is blocked until all required scores are entered and all Knowdown places are unique.'}</p>
			<form method="POST" action="?/finalize"><button type="submit" disabled={data.contest.lifecycle !== 'scoring' || !data.finalization.complete}>Finalize results</button></form>
			{#if data.contest.lifecycle === 'finalized'}<form method="POST" action="?/publish"><button type="submit">{data.contest.resultsPublishedAt ? 'Republish results' : 'Publish results'}</button></form><form method="POST" action="?/reopen"><label>Reason to reopen <textarea name="reason" required></textarea></label><button class="quiet" type="submit">Reopen for correction</button></form>{/if}
		</section>
	{/if}


</main>

<style>
	main { max-width: 1180px; margin: 0 auto; padding: 1rem; }
	h1 { margin-bottom: .25rem; } .subheading, #score-help { color: #556; }
	section { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
	.summary { display: grid; gap: .3rem; padding: .8rem; border-radius: 6px; background: #eef3ff; }
	.categories { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: 1.5rem; border-bottom: 1px solid #ccd5e2; padding-bottom: .6rem; }
	.categories button { background: #eef1f6; color: #263b58; } .categories button.active { background: #203d66; color: white; }
	.entry-section { border: 0; margin-top: .5rem; } h2 { margin-top: 0; }
	.filters { display: flex; flex-wrap: wrap; align-items: end; gap: 1rem; margin-bottom: 1rem; } .filters > span { margin: auto 0 auto auto; color: #667; }
	label { display: flex; flex-direction: column; gap: .3rem; font-weight: 600; font-size: .9rem; } .checkbox { flex-direction: row; align-items: center; min-height: 2.75rem; }
	select, input, textarea { box-sizing: border-box; min-height: 2.75rem; padding: .55rem; font: inherit; border: 1px solid #aab7ca; border-radius: 4px; } .checkbox input { min-height: auto; }
	input[type="search"] { width: min(80vw, 22rem); }
	button { min-height: 2.5rem; padding: .55rem .8rem; border: 0; border-radius: 4px; background: #1a1a2e; color: white; cursor: pointer; font: inherit; } button:disabled { opacity: .5; cursor: not-allowed; } button.quiet { background: #555; }
	button:focus-visible, select:focus-visible { outline: 2px solid #315eab; outline-offset: 2px; }
	.table-scroll { overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: .95rem; } th, td { text-align: left; padding: .5rem .75rem; border-bottom: 1px solid #dce2eb; } thead th { background: #eef2f7; white-space: nowrap; } th button { background: transparent; color: #263b58; padding: .2rem 0; font-weight: 600; } tbody tr:hover { background: #f8faff; } .numeric { text-align: right; width: 7rem; } .team-number { width: 5rem; } .total { font-weight: 600; font-variant-numeric: tabular-nums; } .places { max-width: 48rem; } .places select { width: 100%; } .places th { white-space: nowrap; }
	.error, .success { padding: .7rem; border-radius: 5px; } .error { background: #fbe3e3; color: #9a2020; } .success { background: #e2f5e8; color: #176b35; } .empty { color: #666; text-align: center; padding: 2rem; }
	.controls form { margin: .8rem 0; } .controls textarea { display: block; width: min(100%, 30rem); min-height: 5rem; margin: .3rem 0; }
	@media (max-width: 620px) { th, td { padding: .4rem; } }
</style>
