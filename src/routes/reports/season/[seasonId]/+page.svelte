<script lang="ts">
	let { data } = $props();
	const labels: Record<string, string> = { regional_placements: 'Regional placement qualifications', state_cutoff: 'State cutoff qualifications', manual_review: 'Manual qualification review' };
</script>

<svelte:head><title>{data.season.name} statewide reports — WSMC</title></svelte:head>
<main>
	<p><a href="/program">← Program</a></p>
	<h1>{data.season.name} statewide reports</h1>
	<p class="subheading">Published results and frozen qualification decisions available to assigned coaches and coordinators.</p>
	<p><a href="/reports/qualifications?seasonId={data.season.id}">Download qualification CSV</a></p>

	<section><h2>Contest results</h2><div class="contest-list">{#each data.contests as contest}<article><div><strong>{contest.name}</strong><span>{contest.kind} · {contest.lifecycle}{#if contest.resultsPublishedAt} · published{/if}</span></div>{#if contest.kind === 'regional' && contest.lifecycle === 'finalized'}<a href="/results/{contest.id}">View regional results</a><a href="/reports/results?contestId={contest.id}">Download results CSV</a>{:else if contest.kind === 'state' && contest.lifecycle === 'finalized' && contest.resultsPublishedAt}<a href="/state/{contest.id}/results">View state results</a><a href="/reports/results?contestId={contest.id}">Download results CSV</a>{:else}<span class="muted">Results not published</span>{/if}</article>{/each}</div></section>

	{#each data.rounds as item}<section><h2>{labels[item.kind]}</h2>{#if item.review.round?.status === 'published'}<p class="status">Published and frozen · {item.review.qualifications.length} qualification records</p>{#if item.review.qualifications.length}<table><thead><tr><th>Category</th><th>School</th><th>Student</th><th>Active</th><th>Reasons</th></tr></thead><tbody>{#each item.review.qualifications as qualification}<tr><td>{qualification.category}</td><td>{qualification.schoolName}</td><td>{qualification.studentName ?? 'Team entry'}</td><td>{qualification.active ? 'Yes' : 'No'}</td><td>{qualification.reasons.map((reason) => `${reason.kind}${reason.scope ? ` · ${reason.scope}` : ''}${reason.rank ? ` · rank ${reason.rank}` : ''}`).join('; ')}</td></tr>{/each}</tbody></table>{:else}<p class="empty">No published qualification records.</p>{/if}{:else}<p class="empty">No published qualification round.</p>{/if}</section>{/each}
</main>
<style>
	main { max-width: 1100px; margin: 0 auto; padding: 1rem; overflow-wrap: anywhere; } h1 { margin-bottom: .25rem; } .subheading, .muted, .empty { color: #666; } section { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; } .contest-list { display: grid; gap: .6rem; } article { display: flex; justify-content: space-between; align-items: center; gap: .8rem; padding: .7rem; border: 1px solid #ddd; border-radius: 5px; } article div { display: flex; flex-direction: column; gap: .2rem; } article span { color: #666; font-size: .9rem; } table { width: 100%; border-collapse: collapse; } th, td { padding: .55rem; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; } th { background: #f5f7fb; } .status { color: #176b35; } @media (max-width: 700px) { article { align-items: flex-start; flex-direction: column; } table { display: block; overflow-x: auto; white-space: nowrap; } }
</style>
