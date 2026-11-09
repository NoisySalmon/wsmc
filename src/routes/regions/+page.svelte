<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let search = $state('');
	const assignableContests = $derived(data.contests.filter((contest) => ['setup', 'registration_open'].includes(contest.lifecycle)));
	const visibleUnmappedSchools = $derived(data.unmappedSchools.filter((school) => school.name.toLowerCase().includes(search.toLowerCase())));
	const groups = $derived(data.contests.map((contest) => ({
		...contest,
		participations: data.participations.filter((row) => row.contestId === contest.id)
			.map((row) => ({ ...row, school: data.schools.find((school) => school.id === row.schoolId) }))
			.sort((a, b) => (a.school?.name ?? a.schoolId).localeCompare(b.school?.name ?? b.schoolId))
	})));
	function coachesFor(schoolId: string) {
		return data.coachAssignments.filter((assignment) => assignment.schoolId === schoolId);
	}
</script>

<svelte:head><title>Regions — WSMC</title></svelte:head>

<main>
	<header>
		<p class="eyebrow">{data.season?.year ?? 'No current season'}</p>
		<h1>Regions</h1>
		<p class="intro">Schools are assigned to a regional contest. To change a school's region, remove its participation, then assign it to the new region below. Use Virtual for schools attending outside a local region.</p>
		{#if data.canAddSchools}<p class="muted">School missing from the list? <a href="/schools">Add it under Schools</a>, then assign it here.</p>{/if}
	</header>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
	{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}

	<section class="unmapped" aria-labelledby="unmapped-heading">
		<div class="section-heading">
			<div><h2 id="unmapped-heading">Unmapped schools <span class="count">{data.unmappedSchools.length}</span></h2><p class="muted">Active schools with no regional contest this season.</p></div>
			{#if data.unmappedSchools.length > 0}<label class="search">Find a school<input type="search" placeholder="Search unmapped schools" bind:value={search} /></label>{/if}
		</div>
		{#if data.unmappedSchools.length}
			{#if !assignableContests.length}<p class="muted">No regions are open for assignment. Schools can be assigned before rosters are locked.</p>{/if}
			<ul>
				{#each visibleUnmappedSchools as school (school.id)}
					<li>
						<div class="school"><strong>{school.name}</strong><span class="muted">Division {school.division}</span></div>
						<form class="assignment" method="POST" action="?/assign" use:enhance>
							<input type="hidden" name="schoolId" value={school.id} />
							<label class="sr-only" for="region-{school.id}">Region for {school.name}</label>
							<select id="region-{school.id}" name="contestId" required disabled={!assignableContests.length}>
								<option value="">Choose a region</option>
								{#each assignableContests as contest}<option value={contest.id}>{contest.name}</option>{/each}
							</select>
							<button type="submit" disabled={!assignableContests.length}>Assign region</button>
						</form>
					</li>
				{:else}<li class="muted">No schools match “{search}”.</li>{/each}
			</ul>
		{:else}<p class="empty">All active schools are assigned to a region.</p>{/if}
	</section>

	<section class="regions" aria-labelledby="regions-heading">
		<div class="section-heading"><h2 id="regions-heading">Participating schools by region</h2><span class="muted">{data.contests.length} regions · {data.participations.length} schools</span></div>
		{#each groups as contest (contest.id)}
			<article>
				<div class="region-heading">
					<div><h3>{contest.name}</h3><p class="muted">{contest.participations.length} {contest.participations.length === 1 ? 'school' : 'schools'}{#if !['setup', 'registration_open'].includes(contest.lifecycle)}{' '}· Rosters locked{/if}</p></div>
					<a href="/contests/{contest.id}">Open contest overview →</a>
				</div>
				<ul>
					{#each contest.participations as participation (participation.id)}
						<li>
							<div class="school">
								<strong>{participation.school?.name ?? participation.schoolId}</strong>
								<span class="muted">Division {participation.division}{#if participation.school && !participation.school.active} · Inactive school{/if}</span>
								<span class="muted coach">Coach: {#each coachesFor(participation.schoolId) as coach, i}{i ? '; ' : ''}{coach.displayName || coach.email}{:else}No coach assigned{/each}</span>
							</div>
							<div class="actions">
								<a href="/registration/{contest.id}/{participation.schoolId}">Open registration</a>
								<form method="POST" action="?/withdraw" use:enhance>
									<input type="hidden" name="participationId" value={participation.id} />
									<input type="hidden" name="contestId" value={contest.id} />
									<button class="remove" type="submit" disabled={!['setup', 'registration_open'].includes(contest.lifecycle)}>Remove participation</button>
								</form>
							</div>
						</li>
					{:else}<li class="muted">No schools assigned to this region.</li>{/each}
				</ul>
			</article>
		{:else}<p class="empty">No regional contests are available for you to manage in the current season.</p>{/each}
	</section>
</main>

<style>
	main { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }
	h1 { margin: .35rem 0 .8rem; font-size: 1.9rem; } h2 { margin: 0; font-size: 1.25rem; } h3 { margin: 0; font-size: 1.1rem; }
	.eyebrow { color: #596273; font-size: .85rem; font-weight: 650; margin: 0; } .intro { max-width: 820px; line-height: 1.6; }
	.muted { color: #596273; } header > .muted { font-size: .9rem; }
	section { margin-top: 2rem; } .unmapped { border: 1px solid #d9e0ec; background: #f8faff; border-radius: 8px; padding: 1.25rem; }
	.section-heading, .region-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
	.section-heading p, .region-heading p { margin: .4rem 0 0; font-size: .9rem; }
	.count { display: inline-block; padding: .15rem .5rem; border-radius: 20px; background: #e5ebf6; font-size: .85rem; vertical-align: middle; }
	.search { display: flex; flex-direction: column; gap: .3rem; font-size: .85rem; font-weight: 600; }
	input, select { font: inherit; padding: .6rem; border: 1px solid #b7c1d1; border-radius: 4px; background: white; min-width: 0; }
	ul { list-style: none; padding: 0; margin: 1rem 0 0; } li { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; padding: 1rem 0; border-top: 1px solid #e2e6ed; }
	.school { min-width: 0; display: flex; flex-direction: column; gap: .2rem; overflow-wrap: anywhere; } .school span { font-size: .85rem; } .coach { margin-top: .2rem; }
	.assignment, .actions { display: flex; align-items: center; gap: 1rem; } .assignment select { width: 300px; max-width: 100%; font-size: .9rem; } .actions { flex-shrink: 0; font-size: .9rem; }
	button { font: inherit; min-height: 2.65rem; background: #1a1a2e; color: white; border: 1px solid #1a1a2e; border-radius: 4px; padding: .55rem .8rem; cursor: pointer; white-space: nowrap; }
	button.remove { background: white; border-color: #d1d7e0; color: #7c2931; font-size: .85rem; } button:disabled { opacity: .5; cursor: not-allowed; }
	article { border: 1px solid #d9e0ec; border-radius: 8px; margin-top: 1rem; overflow: hidden; } .region-heading { padding: 1.1rem 1.25rem; background: #f5f7fb; } .region-heading a { font-size: .9rem; } article ul { margin: 0; padding: 0 1.25rem; }
	.empty { color: #596273; margin-bottom: 0; } .error, .success { padding: .8rem; border-radius: 4px; } .error { background: #fbe3e3; color: #9a2020; } .success { background: #e2f5e8; color: #176b35; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
	@media (max-width: 800px) { li, .section-heading, .region-heading { align-items: flex-start; flex-direction: column; gap: .8rem; } .assignment { width: 100%; } .assignment select { flex: 1; width: 0; } .actions { flex-wrap: wrap; } }
	@media (max-width: 450px) { main { padding: 1.5rem 1rem; } h1 { font-size: 1.6rem; } .assignment { flex-direction: column; align-items: stretch; } .assignment select { width: 100%; flex: auto; } .assignment button { align-self: flex-start; } }
</style>
