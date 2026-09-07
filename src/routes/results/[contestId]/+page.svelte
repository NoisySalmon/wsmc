<script lang="ts">
	let { data } = $props();
	const labels: Record<string, string> = { project: 'Project', team_contest: 'Team Contest', topical_team: 'Topical Team', topical_individual: 'Topical Individual', knowdown: 'Knowdown' };
	function board(category: string, division?: number) { return data.rankings[category as keyof typeof data.rankings].filter((entry) => division === undefined || entry.division === division); }
</script>

<svelte:head><title>{data.contest.name} results — WSMC</title></svelte:head>
<main><p><a href="/program">← Program</a></p><h1>{data.contest.name}</h1><p class="subheading">Finalized regional results{#if data.contest.resultsPublishedAt} · Published{/if}</p>
	{#each ['project', 'team_contest', 'topical_team'] as category}<section><h2>{labels[category]}</h2>{#each [1, 2] as division}<h3>Division {division}</h3>{#if board(category, division).length}<table><thead><tr><th>Rank</th><th>School</th><th>Entry</th><th>Score</th></tr></thead><tbody>{#each board(category, division) as entry}<tr><td>{entry.rank}</td><td>{entry.schoolName}</td><td>{entry.entryNumber ?? '—'}</td><td>{entry.score}</td></tr>{/each}</tbody></table>{:else}<p class="empty">No completed results.</p>{/if}{/each}</section>{/each}
	<section><h2>Topical Individual</h2>{#each [1, 2] as division}<h3>Division {division}</h3>{#if board('topical_individual', division).length}<table><thead><tr><th>Overall</th><th>Actual grade</th><th>Grade rank</th><th>Student</th><th>School</th><th>Total</th></tr></thead><tbody>{#each board('topical_individual', division) as entry}<tr><td>{entry.rank}</td><td>{entry.actualGrade}</td><td>{entry.actualGradeRank}</td><td>{entry.studentName}</td><td>{entry.schoolName}</td><td>{entry.score}</td></tr>{/each}</tbody></table>{:else}<p class="empty">No completed results.</p>{/if}{/each}</section>
	<section><h2>Knowdown</h2>{#if board('knowdown').length}<table><thead><tr><th>Place</th><th>Student</th><th>School</th></tr></thead><tbody>{#each board('knowdown') as entry}<tr><td>{entry.rank}</td><td>{entry.studentName ?? '—'}</td><td>{entry.schoolName}</td></tr>{/each}</tbody></table>{:else}<p class="empty">No completed results.</p>{/if}</section>
</main>
<style>
	main { max-width: 980px; margin: 0 auto; padding: 1rem; overflow-wrap: anywhere; } h1 { margin-bottom: .25rem; } .subheading, .empty { color: #666; } section { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; } table { width: 100%; border-collapse: collapse; } th, td { padding: .6rem; border-bottom: 1px solid #eee; text-align: left; } th { background: #f5f7fb; } h3 { margin-bottom: .4rem; }
</style>
