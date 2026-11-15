<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Help — WSMC</title></svelte:head>
<main>
	<h1>Help</h1>
	<p>Step-by-step guides for contest participants and organizers.</p>
	<article>
		<h2><a href="/help/coach/regional">Coach guide: regional contest</a></h2>
		<p>Add students, use the registration worksheet, edit student details, and remove students safely.</p>
	</article>
	{#if data.principal?.isAdmin}
		<article>
			<h2>Season exports</h2>
			<p>Download a ZIP of spreadsheets (CSV files) to keep an archive or work offline. Available at any stage, including archived seasons; unfinished contests and draft qualifications contain incomplete data.</p>
			<p>Regionals includes regional rosters, entries, team membership, scores, and ranks. Qualifications adds saved draft and published decisions, reasons, and cutoffs. State includes the full season plus state attendance, rosters, and event assignments.</p>
			<p>Each download includes instructions, status information, and event scoring sheets. Enter offline scores manually when connectivity returns.</p>
			{#each data.exportSeasons as season}
				<section>
					<h3>{season.year}{season.status === 'archived' ? ' · Archived' : ''}</h3>
					<ul aria-label={`${season.year} exports`}>
						<li><a href="/reports/regionals?seasonId={season.id}">Download regionals</a></li>
						<li><a href="/reports/qualifications?seasonId={season.id}">Download qualifications</a></li>
						<li><a href="/reports/state?seasonId={season.id}">Download state contest</a></li>
					</ul>
				</section>
			{:else}
				<p>No seasons available to export.</p>
			{/each}
		</article>
	{/if}
</main>
<style>
	main { max-width: 900px; margin: auto; padding: 2rem 1rem; }
	article { border: 1px solid #dce1ea; border-radius: 8px; padding: 1rem 1.5rem; margin-top: 2rem; }
	h2 { font-size: 1.2rem; }
	p { line-height: 1.6; }
	section { border-top: 1px solid #dce1ea; margin-top: 1rem; }
	li { margin: .5rem 0; }
</style>
