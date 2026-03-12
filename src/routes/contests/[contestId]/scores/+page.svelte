<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';

	let { data, form } = $props();

	const tabs = [
		{ id: 'project', label: 'Project' },
		{ id: 'team_problem', label: 'Team Problem' },
		{ id: 'topical_team', label: 'Topical Team' },
		{ id: 'topical_individual', label: 'Topical Individual' },
		{ id: 'knowdown', label: 'Knowdown' },
	] as const;

	let activeTab = $state(form?.tab ?? 'project');

	function totalForParts(p1: number | null, p2: number | null): string {
		if (p1 == null && p2 == null) return '—';
		return String((p1 ?? 0) + (p2 ?? 0));
	}

	// For knowdown, track selected students to prevent duplicates
	function knowdownSelected(place: number): string {
		const result = data.knowdownResults.find((r) => r.place === place);
		return result?.studentId ?? '';
	}
</script>

<svelte:head>
	<title>Score Entry — {data.contest.name}</title>
</svelte:head>

<main>
	<p class="breadcrumb">
		<a href="/contests/{data.contest.id}">← {data.contest.name}</a>
	</p>

	<h1>Score Entry</h1>

	{#if form?.success}
		<p class="success">Scores saved.</p>
	{/if}

	<nav class="tabs">
		{#each tabs as tab}
			<button
				class="tab"
				class:active={activeTab === tab.id}
				onclick={() => activeTab = tab.id}
			>{tab.label}</button>
		{/each}
	</nav>

	<div class="tab-content">
		<!-- ─── PROJECT SCORES ─── -->
		{#if activeTab === 'project'}
			<form method="POST" action="?/saveProjectScores" use:enhance>
				{#if data.projectTeams.length === 0}
					<p class="empty">No project teams registered yet.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>School</th>
								<th>Team</th>
								<th>Div</th>
								<th>Members</th>
								<th>Score</th>
							</tr>
						</thead>
						<tbody>
							{#each data.projectTeams as team}
								<tr>
									<td>{team.schoolName}</td>
									<td>Team {team.teamNumber}</td>
									<td>{team.division}</td>
									<td class="members">{team.members.map(m => `${m.name} (${m.competingGrade})`).join(', ')}</td>
									<td>
										<input
											type="number"
											step="0.5"
											name="score_{team.id}"
											value={team.score ?? ''}
											class="score-input"
											placeholder="—"
										/>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<div class="form-actions">
						<button type="submit">Save Project Scores</button>
					</div>
				{/if}
			</form>

		<!-- ─── TEAM PROBLEM SCORES ─── -->
		{:else if activeTab === 'team_problem'}
			<form method="POST" action="?/saveTeamProblemScores" use:enhance>
				{#if data.teamProblemTeams.length === 0}
					<p class="empty">No team problem teams registered yet.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>School</th>
								<th>Team</th>
								<th>Div</th>
								<th>Members</th>
								<th>Score</th>
							</tr>
						</thead>
						<tbody>
							{#each data.teamProblemTeams as team}
								<tr>
									<td>{team.schoolName}</td>
									<td>Team {team.teamNumber}</td>
									<td>{team.division}</td>
									<td class="members">{team.members.map(m => `${m.name} (${m.competingGrade})`).join(', ')}</td>
									<td>
										<input
											type="number"
											step="0.5"
											name="score_{team.id}"
											value={team.score ?? ''}
											class="score-input"
											placeholder="—"
										/>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<div class="form-actions">
						<button type="submit">Save Team Problem Scores</button>
					</div>
				{/if}
			</form>

		<!-- ─── TOPICAL TEAM SCORES ─── -->
		{:else if activeTab === 'topical_team'}
			<form method="POST" action="?/saveTopicalTeamScores" use:enhance>
				{#if data.topicalTeams.length === 0}
					<p class="empty">No topical teams registered yet.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>School</th>
								<th>Team</th>
								<th>Div</th>
								<th>Members</th>
								<th>Part 1</th>
								<th>Part 2</th>
								<th>Total</th>
							</tr>
						</thead>
						<tbody>
							{#each data.topicalTeams as team}
								<tr>
									<td>{team.schoolName}</td>
									<td>Team {team.teamNumber}</td>
									<td>{team.division}</td>
									<td class="members">{team.members.map(m => `${m.name} (${m.competingGrade})`).join(', ')}</td>
									<td>
										<input
											type="number"
											step="0.5"
											min="0"
											max="75"
											name="part1_{team.id}"
											value={team.part1 ?? ''}
											class="score-input"
											placeholder="—"
										/>
									</td>
									<td>
										<input
											type="number"
											step="0.5"
											min="0"
											max="75"
											name="part2_{team.id}"
											value={team.part2 ?? ''}
											class="score-input"
											placeholder="—"
										/>
									</td>
									<td class="total">{totalForParts(team.part1, team.part2)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<div class="form-actions">
						<button type="submit">Save Topical Team Scores</button>
					</div>
				{/if}
			</form>

		<!-- ─── TOPICAL INDIVIDUAL SCORES ─── -->
		{:else if activeTab === 'topical_individual'}
			<form method="POST" action="?/saveTopicalIndividualScores" use:enhance>
				{#if data.topicalIndividuals.length === 0}
					<p class="empty">No individual topical competitors.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>Student</th>
								<th>School</th>
								<th>Div</th>
								<th>Grade</th>
								<th>Part 1</th>
								<th>Part 2</th>
								<th>Total</th>
							</tr>
						</thead>
						<tbody>
							{#each data.topicalIndividuals as student}
								<tr>
									<td>{student.name}</td>
									<td>{student.schoolName}</td>
									<td>{student.division}</td>
									<td>{student.competingGrade}</td>
									<td>
										<input
											type="number"
											step="0.5"
											min="0"
											max="75"
											name="part1_{student.id}"
											value={student.part1 ?? ''}
											class="score-input"
											placeholder="—"
										/>
									</td>
									<td>
										<input
											type="number"
											step="0.5"
											min="0"
											max="75"
											name="part2_{student.id}"
											value={student.part2 ?? ''}
											class="score-input"
											placeholder="—"
										/>
									</td>
									<td class="total">{totalForParts(student.part1, student.part2)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<div class="form-actions">
						<button type="submit">Save Individual Scores</button>
					</div>
				{/if}
			</form>

		<!-- ─── KNOWDOWN RESULTS ─── -->
		{:else if activeTab === 'knowdown'}
			<form method="POST" action="?/saveKnowdown" use:enhance>
				{#if data.knowdownEligible.length === 0}
					<p class="empty">No students designated for Knowdown yet.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>Place</th>
								<th>Student</th>
							</tr>
						</thead>
						<tbody>
							{#each [{ place: 1, label: '1st Place' }, { place: 2, label: '2nd Place' }, { place: 3, label: '3rd Place' }, { place: 4, label: '4th (Alternate)' }] as row}
								<tr>
									<td class="place-label">{row.label}</td>
									<td>
										<select name="place_{row.place}" class="knowdown-select">
											<option value="">— Select —</option>
											{#each data.knowdownEligible as student}
												<option value={student.id} selected={knowdownSelected(row.place) === student.id}>
													{student.name} ({student.schoolName}, Div {student.division})
												</option>
											{/each}
										</select>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<div class="form-actions">
						<button type="submit">Save Knowdown Results</button>
					</div>
				{/if}
			</form>
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

	/* Tabs */
	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 2px solid #ddd;
		margin: 1.5rem 0 0;
	}
	.tab {
		padding: 0.6rem 1.2rem;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		color: #666;
		font-size: 0.9rem;
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

	.tab-content {
		padding: 1.5rem 0;
	}

	/* Table */
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
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
	.members {
		font-size: 0.8rem;
		color: #555;
		max-width: 300px;
	}
	.total {
		font-weight: 600;
		color: #1a1a2e;
	}
	.place-label {
		font-weight: 600;
		font-size: 1rem;
		width: 140px;
	}

	/* Inputs */
	.score-input {
		width: 80px;
		padding: 0.4rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.95rem;
		text-align: right;
	}
	.score-input:focus {
		outline: none;
		border-color: #1a1a2e;
		box-shadow: 0 0 0 2px rgba(26, 26, 46, 0.15);
	}
	.knowdown-select {
		width: 100%;
		max-width: 400px;
		padding: 0.4rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.95rem;
	}
	.knowdown-select:focus {
		outline: none;
		border-color: #1a1a2e;
		box-shadow: 0 0 0 2px rgba(26, 26, 46, 0.15);
	}

	/* Actions */
	.form-actions {
		margin-top: 1rem;
		display: flex;
		gap: 0.5rem;
	}
	button[type="submit"] {
		padding: 0.6rem 1.5rem;
		background: #1a1a2e;
		color: #fff;
		border: none;
		border-radius: 4px;
		font-size: 0.95rem;
		cursor: pointer;
	}
	button[type="submit"]:hover {
		background: #2a2a4e;
	}

	/* States */
	.empty {
		color: #888;
		font-style: italic;
	}
	.success {
		color: #060;
		background: #efe;
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.9rem;
	}
</style>
