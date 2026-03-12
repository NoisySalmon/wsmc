<script lang="ts">
	import { rankByScore, rankIndividuals, getDistinguishedIndividualIds, type RankedEntry, type TeamRankingEntry, type IndividualRankingEntry } from '$lib/rankings';

	let { data } = $props();

	const tabs = [
		{ id: 'project', label: 'Project' },
		{ id: 'team_problem', label: 'Team Problem' },
		{ id: 'topical_team', label: 'Topical Team' },
		{ id: 'topical_individual', label: 'Topical Individual' },
		{ id: 'knowdown', label: 'Knowdown' },
	] as const;

	let activeTab = $state<string>('project');
	let divisionFilter = $state<number>(0); // 0 = all

	const placeLabels = ['', '🥇 1st', '🥈 2nd', '🥉 3rd', '4th (Alt)'];

	function filteredTeamRankings(entries: TeamRankingEntry[]): RankedEntry<TeamRankingEntry>[] {
		return rankByScore(entries, divisionFilter || undefined);
	}

	function filteredIndividualRankings(entries: IndividualRankingEntry[]): RankedEntry<IndividualRankingEntry>[] {
		return rankIndividuals(entries, { division: divisionFilter || undefined });
	}
</script>

<svelte:head>
	<title>Leaderboard — {data.contest.name}</title>
</svelte:head>

<main>
	<p class="breadcrumb">
		<a href="/contests/{data.contest.id}">← {data.contest.name}</a>
	</p>

	<h1>Leaderboard</h1>

	<div class="controls">
		<nav class="tabs">
			{#each tabs as tab}
				<button
					class="tab"
					class:active={activeTab === tab.id}
					onclick={() => activeTab = tab.id}
				>{tab.label}</button>
			{/each}
		</nav>

		<div class="division-filter">
			<label>
				Division:
				<select bind:value={divisionFilter}>
					<option value={0}>All</option>
					<option value={1}>Division 1</option>
					<option value={2}>Division 2</option>
				</select>
			</label>
		</div>
	</div>

	<div class="tab-content">
		<!-- ─── PROJECT ─── -->
		{#if activeTab === 'project'}
			{@const ranked = filteredTeamRankings(data.projectRankings)}
			<h2>Project Rankings</h2>
			{#if ranked.length === 0}
				<p class="empty">No project scores recorded yet.</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th class="rank-col">#</th>
							<th>School</th>
							<th>Team</th>
							<th>Div</th>
							<th>Members</th>
							<th class="score-col">Score</th>
						</tr>
					</thead>
					<tbody>
						{#each ranked as entry}
							<tr class:top3={entry.rank <= 3}>
								<td class="rank">{entry.rank}</td>
								<td>{entry.schoolName}</td>
								<td>Team {entry.teamNumber}</td>
								<td>{entry.division}</td>
								<td class="members">{entry.members.map(m => m.name).join(', ')}</td>
								<td class="score">{entry.score}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

		<!-- ─── TEAM PROBLEM ─── -->
		{:else if activeTab === 'team_problem'}
			{@const ranked = filteredTeamRankings(data.teamProblemRankings)}
			<h2>Team Problem Rankings</h2>
			{#if ranked.length === 0}
				<p class="empty">No team problem scores recorded yet.</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th class="rank-col">#</th>
							<th>School</th>
							<th>Team</th>
							<th>Div</th>
							<th>Members</th>
							<th class="score-col">Score</th>
						</tr>
					</thead>
					<tbody>
						{#each ranked as entry}
							<tr class:top3={entry.rank <= 3}>
								<td class="rank">{entry.rank}</td>
								<td>{entry.schoolName}</td>
								<td>Team {entry.teamNumber}</td>
								<td>{entry.division}</td>
								<td class="members">{entry.members.map(m => m.name).join(', ')}</td>
								<td class="score">{entry.score}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

		<!-- ─── TOPICAL TEAM ─── -->
		{:else if activeTab === 'topical_team'}
			{@const ranked = filteredTeamRankings(data.topicalTeamRankings)}
			<h2>Topical Team Rankings</h2>
			{#if ranked.length === 0}
				<p class="empty">No topical team scores recorded yet.</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th class="rank-col">#</th>
							<th>School</th>
							<th>Team</th>
							<th>Div</th>
							<th>Members</th>
							<th class="score-col">Total</th>
						</tr>
					</thead>
					<tbody>
						{#each ranked as entry}
							<tr class:top3={entry.rank <= 3}>
								<td class="rank">{entry.rank}</td>
								<td>{entry.schoolName}</td>
								<td>Team {entry.teamNumber}</td>
								<td>{entry.division}</td>
								<td class="members">{entry.members.map(m => m.name).join(', ')}</td>
								<td class="score">{entry.score}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

		<!-- ─── TOPICAL INDIVIDUAL ─── -->
		{:else if activeTab === 'topical_individual'}
			{@const ranked = filteredIndividualRankings(data.topicalIndividualRankings)}
			{@const distinguishedIds = getDistinguishedIndividualIds(ranked)}
			<h2>Topical Individual Rankings</h2>
			{#if ranked.length === 0}
				<p class="empty">No individual topical scores recorded yet.</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th class="rank-col">#</th>
							<th>Student</th>
							<th>School</th>
							<th>Div</th>
							<th>Grade</th>
							<th class="score-col">Part 1</th>
							<th class="score-col">Part 2</th>
							<th class="score-col">Total</th>
							<th>Awards</th>
						</tr>
					</thead>
					<tbody>
						{#each ranked as entry}
							{@const isDistinguished = distinguishedIds.has(entry.studentId)}
							<tr class:top3={entry.rank <= 3} class:distinguished={isDistinguished}>
								<td class="rank">{entry.rank}</td>
								<td>{entry.name}</td>
								<td>{entry.schoolName}</td>
								<td>{entry.division}</td>
								<td>{entry.competingGrade}</td>
								<td class="score">{entry.part1}</td>
								<td class="score">{entry.part2}</td>
								<td class="score total">{entry.total}</td>
								<td>
									{#if entry.rank === 1}🥇 1st Overall
									{:else if entry.rank === 2}🥈 2nd Overall
									{:else if entry.rank === 3}🥉 3rd Overall
									{:else if isDistinguished}
										<span class="dist-badge">{distinguishedIds.get(entry.studentId)}</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

		<!-- ─── KNOWDOWN ─── -->
		{:else if activeTab === 'knowdown'}
			<h2>Knowdown Results</h2>
			{#if data.knowdownResults.length === 0}
				<p class="empty">No knowdown results recorded yet.</p>
			{:else}
				<table class="knowdown-table">
					<thead>
						<tr>
							<th>Place</th>
							<th>Student</th>
							<th>School</th>
						</tr>
					</thead>
					<tbody>
						{#each data.knowdownResults as result}
							<tr class:top3={result.place <= 3}>
								<td class="place">{placeLabels[result.place]}</td>
								<td>{result.studentName}</td>
								<td>{result.schoolName}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

		{/if}
	</div>
</main>

<style>
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem;
	}
	.breadcrumb a {
		color: #666;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.breadcrumb a:hover {
		color: #1a1a2e;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 1.5rem 0 0;
	}

	/* Tabs */
	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 2px solid #ddd;
	}
	.tab {
		padding: 0.6rem 1rem;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		color: #666;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		border-radius: 0;
	}
	.tab:hover {
		color: #1a1a2e;
		background: #f8f8f8;
	}
	.tab.active {
		color: #1a1a2e;
		border-bottom-color: #1a1a2e;
		font-weight: 600;
		background: transparent;
	}

	.division-filter {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.division-filter label {
		font-size: 0.9rem;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.division-filter select {
		padding: 0.3rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.tab-content {
		padding: 1rem 0;
	}
	h2 {
		margin-top: 0;
	}
	h3 {
		margin: 1.5rem 0 0.5rem;
		color: #444;
	}

	/* Table */
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}
	th, td {
		text-align: left;
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid #eee;
	}
	th {
		font-weight: 600;
		font-size: 0.8rem;
		color: #666;
		text-transform: uppercase;
		border-bottom-color: #ddd;
	}
	.rank-col { width: 50px; }
	.score-col { width: 80px; text-align: right; }
	.rank {
		font-weight: 700;
		color: #1a1a2e;
	}
	.score {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.total {
		font-weight: 600;
	}
	.members {
		font-size: 0.8rem;
		color: #555;
	}
	.place {
		font-weight: 600;
		font-size: 1rem;
	}
	tr.top3 {
		background: #f0f4ff;
	}
	tr.top3 .rank {
		color: #0046a0;
	}
	tr.distinguished {
		background: #fdfae6;
	}
	.dist-badge {
		background: #fff3cd;
		color: #856404;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.knowdown-table {
		max-width: 600px;
	}

	/* States */
	.empty {
		color: #888;
		font-style: italic;
	}
	.hint {
		color: #666;
		font-size: 0.85rem;
		margin-top: -0.5rem;
	}
</style>
