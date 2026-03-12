<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatContestType } from '$lib/validation';

	let { data, form } = $props();

	const contestTypes = ['project', 'team_problem', 'topical'] as const;

	function studentsOnTopicalTeam(): Set<string> {
		const ids = new Set<string>();
		for (const team of data.teams) {
			if (team.contestType === 'topical') {
				for (const m of team.members) ids.add(m.studentId);
			}
		}
		return ids;
	}

	function studentsOnTeamOfType(contestType: string): Set<string> {
		const ids = new Set<string>();
		for (const team of data.teams) {
			if (team.contestType === contestType) {
				for (const m of team.members) ids.add(m.studentId);
			}
		}
		return ids;
	}

	function availableForTeam(teamId: string, contestType: string) {
		const onType = studentsOnTeamOfType(contestType);
		const team = data.teams.find((t) => t.id === teamId);
		const teamGrades = new Set(team?.members.map((m) => m.competingGrade) ?? []);
		return data.students.filter((s) =>
			!onType.has(s.id) && !teamGrades.has(s.competingGrade)
		);
	}

	function knowdownCount() {
		return data.students.filter((s) => s.isKnowdown).length;
	}

	function topicalIndividuals() {
		const onTeam = studentsOnTopicalTeam();
		return data.students.filter((s) => !onTeam.has(s.id));
	}
</script>

<svelte:head>
	<title>{data.school.name} — {data.contest.name}</title>
</svelte:head>

<main>
	<p class="breadcrumb">
		<a href="/contests/{data.contest.id}">← {data.contest.name}</a>
	</p>

	<h1>{data.school.name}</h1>
	<p class="subtitle">Division {data.school.division} &bull; {data.school.coachName || 'No coach assigned'}</p>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}
	{#if form?.success && form?.action !== 'addStudent'}
		<p class="success">Saved.</p>
	{/if}

	<!-- ─── SCHOOL INFO (collapsible) ─── -->
	<details class="section">
		<summary>School Details</summary>
		<form method="POST" action="?/update" use:enhance>
			<div class="form-grid">
				<label>
					Name <input type="text" name="name" value={data.school.name} required />
				</label>
				<label>
					Short Name <input type="text" name="short_name" value={data.school.shortName} />
				</label>
				<label>
					Division
					<select name="division" required>
						<option value="1" selected={data.school.division === 1}>Division 1</option>
						<option value="2" selected={data.school.division === 2}>Division 2</option>
					</select>
				</label>
				<label>
					Coach Name <input type="text" name="coach_name" value={data.school.coachName} />
				</label>
				<label>
					Coach Email <input type="email" name="coach_email" value={data.school.coachEmail} />
				</label>
				<label>
					Coach Phone <input type="tel" name="coach_phone" value={data.school.coachPhone} />
				</label>
				<label>
					Address <input type="text" name="address" value={data.school.address} />
				</label>
				<label>
					City / ZIP <input type="text" name="city_zip" value={data.school.cityZip} />
				</label>
			</div>
			<button type="submit">Save School Info</button>
		</form>
	</details>

	<!-- ─── STUDENT ROSTER ─── -->
	<section class="section">
		<h2>Students ({data.students.length})</h2>

		{#if data.students.length > 0}
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Grade</th>
						<th>Competing</th>
						<th>Knowdown</th>
						<th>Topical Mode</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.students as student}
						{@const onTopicalTeam = studentsOnTopicalTeam().has(student.id)}
						<tr>
							<td>{student.name}</td>
							<td>{student.actualGrade}</td>
							<td>
								{#if student.competingGrade !== student.actualGrade}
									<strong>{student.competingGrade}</strong> <span class="badge">playing up</span>
								{:else}
									{student.competingGrade}
								{/if}
							</td>
							<td>
								<form method="POST" action="?/toggleKnowdown" class="inline-form" use:enhance>
									<input type="hidden" name="student_id" value={student.id} />
									<input type="hidden" name="enable" value={student.isKnowdown ? '0' : '1'} />
									<button type="submit" class="toggle-btn" class:active={student.isKnowdown}
										disabled={!student.isKnowdown && knowdownCount() >= 3}
										title={!student.isKnowdown && knowdownCount() >= 3 ? 'Max 3 Knowdown per school' : ''}>
										{student.isKnowdown ? '✓ Yes' : 'No'}
									</button>
								</form>
							</td>
							<td>
								{#if onTopicalTeam}
									<span class="badge team">Team</span>
								{:else}
									<span class="badge individual">Individual</span>
								{/if}
							</td>
							<td class="actions-cell">
								<details class="edit-popover">
									<summary>Edit</summary>
									<form method="POST" action="?/updateStudent" class="popover-form" use:enhance>
										<input type="hidden" name="student_id" value={student.id} />
										<label>Name <input type="text" name="name" value={student.name} required /></label>
										<label>Grade <select name="actual_grade">
											{#each [9, 10, 11, 12] as g}<option value={g} selected={student.actualGrade === g}>{g}</option>{/each}
										</select></label>
										<label>Competing <select name="competing_grade">
											{#each [9, 10, 11, 12] as g}<option value={g} selected={student.competingGrade === g}>{g}</option>{/each}
										</select></label>
										<button type="submit">Save</button>
									</form>
								</details>
								<form method="POST" action="?/deleteStudent" class="inline-form" use:enhance>
									<input type="hidden" name="student_id" value={student.id} />
									<button type="submit" class="delete-btn-sm" onclick={(e) => { if (!confirm(`Remove ${student.name}?`)) e.preventDefault(); }}>✕</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}

		<form method="POST" action="?/addStudent" class="add-row" use:enhance>
			<input type="text" name="name" placeholder="Student name" required />
			<select name="actual_grade" required>
				<option value="">Grade</option>
				{#each [9, 10, 11, 12] as g}<option value={g}>{g}</option>{/each}
			</select>
			<select name="competing_grade">
				<option value="">Same</option>
				{#each [9, 10, 11, 12] as g}<option value={g}>{g}</option>{/each}
			</select>
			<button type="submit">+ Add Student</button>
		</form>
		{#if form?.action === 'addStudent' && form?.error}
			<p class="error">{form.error}</p>
		{/if}
	</section>

	<!-- ─── TEAMS ─── -->
	{#each contestTypes as contestType}
		{@const typeTeams = data.teams.filter((t) => t.contestType === contestType)}
		<section class="section">
			<div class="section-header">
				<h2>{formatContestType(contestType)} Teams ({typeTeams.length})</h2>
				<form method="POST" action="?/createTeam" class="inline-form" use:enhance>
					<input type="hidden" name="contest_type" value={contestType} />
					<button type="submit" class="btn-sm">+ New Team</button>
				</form>
			</div>

			{#each typeTeams as team}
				<div class="team-card">
					<div class="team-header">
						<h3>Team {team.teamNumber}</h3>
						<form method="POST" action="?/deleteTeam" class="inline-form" use:enhance>
							<input type="hidden" name="team_id" value={team.id} />
							<button type="submit" class="delete-btn-sm" onclick={(e) => { if (!confirm('Delete this team?')) e.preventDefault(); }}>Delete</button>
						</form>
					</div>

					{#if team.members.length > 0}
						<ul class="member-list">
							{#each team.members as member}
								<li>
									<span>{member.name} <span class="grade-badge">Gr. {member.competingGrade}</span></span>
									<form method="POST" action="?/removeFromTeam" class="inline-form" use:enhance>
										<input type="hidden" name="team_id" value={team.id} />
										<input type="hidden" name="student_id" value={member.studentId} />
										<button type="submit" class="remove-btn">✕</button>
									</form>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="empty">No members yet.</p>
					{/if}

					{#if team.members.length < 3}
						{@const available = availableForTeam(team.id, contestType)}
						{#if available.length > 0}
							<form method="POST" action="?/addToTeam" class="add-member-form" use:enhance>
								<input type="hidden" name="team_id" value={team.id} />
								<select name="student_id" required>
									<option value="">Add student…</option>
									{#each available as s}
										<option value={s.id}>{s.name} (Gr. {s.competingGrade})</option>
									{/each}
								</select>
								<button type="submit" class="btn-sm">Add</button>
							</form>
						{:else}
							<p class="empty">No eligible students available.</p>
						{/if}
					{/if}

					{#if form?.action === 'addToTeam' && 'teamId' in form && form.teamId === team.id && form?.error}
						<p class="error">{form.error}</p>
					{/if}
				</div>
			{/each}

			{#if typeTeams.length === 0}
				<p class="empty">No teams yet. Click "+ New Team" to create one.</p>
			{/if}
		</section>
	{/each}

	<!-- ─── TOPICAL INDIVIDUAL SUMMARY ─── -->
	<section class="section">
		<h2>Topical Individual Competitors</h2>
		<p class="hint">Students not on a topical team compete individually.</p>
		{#if topicalIndividuals().length > 0}
			<ul class="simple-list">
				{#each topicalIndividuals() as s}
					<li>{s.name} — Grade {s.competingGrade}</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">All students are on topical teams (or no students added yet).</p>
		{/if}
	</section>

	<!-- ─── KNOWDOWN SUMMARY ─── -->
	<section class="section">
		<h2>Knowdown Competitors ({knowdownCount()}/3)</h2>
		{#if data.students.filter((s) => s.isKnowdown).length > 0}
			<ul class="simple-list">
				{#each data.students.filter((s) => s.isKnowdown) as s}
					<li>{s.name} — Grade {s.competingGrade}</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">No Knowdown competitors selected. Use the toggle in the student roster above.</p>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}
	.breadcrumb a {
		color: #666;
		text-decoration: none;
		font-size: 0.9rem;
	}
	.subtitle {
		color: #666;
		margin-top: -0.5rem;
	}
	.section {
		margin: 1.5rem 0;
		padding: 1rem;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
	}
	details.section {
		cursor: default;
	}
	details.section > summary {
		cursor: pointer;
		font-weight: 600;
		font-size: 1.1rem;
	}
	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.section-header h2 {
		margin: 0;
	}

	/* Form styles */
	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem 1rem;
		margin: 1rem 0;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-weight: 500;
		font-size: 0.85rem;
	}
	input, select {
		padding: 0.4rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.95rem;
	}

	/* Table */
	table {
		width: 100%;
		border-collapse: collapse;
		margin: 0.5rem 0;
		font-size: 0.9rem;
	}
	th, td {
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid #eee;
	}
	th { font-weight: 600; font-size: 0.8rem; color: #666; text-transform: uppercase; }

	/* Add student row */
	.add-row {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
		align-items: flex-end;
	}
	.add-row input, .add-row select {
		flex: 1;
	}

	/* Buttons */
	button {
		padding: 0.4rem 0.8rem;
		background: #1a1a2e;
		color: #fff;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.85rem;
	}
	button:hover { background: #2a2a4e; }
	button:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn-sm {
		padding: 0.3rem 0.7rem;
		font-size: 0.8rem;
	}
	.delete-btn-sm {
		background: #c00;
		padding: 0.2rem 0.5rem;
		font-size: 0.8rem;
		color: #fff;
		border: none;
		border-radius: 3px;
		cursor: pointer;
	}
	.delete-btn-sm:hover { background: #a00; }
	.remove-btn {
		background: transparent;
		color: #c00;
		padding: 0.1rem 0.4rem;
		font-size: 0.9rem;
	}
	.remove-btn:hover { background: #fee; }

	/* Toggle button */
	.toggle-btn {
		background: #e0e0e0;
		color: #333;
		padding: 0.2rem 0.6rem;
		font-size: 0.8rem;
		border-radius: 12px;
	}
	.toggle-btn.active {
		background: #1a7a1a;
		color: #fff;
	}
	.toggle-btn:hover { opacity: 0.8; }

	/* Badges */
	.badge {
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		background: #e8e8f8;
		color: #444;
	}
	.badge.team { background: #d0e8ff; color: #036; }
	.badge.individual { background: #fff3cd; color: #856404; }
	.grade-badge {
		font-size: 0.75rem;
		color: #666;
	}

	/* Team card */
	.team-card {
		border: 1px solid #e8e8e8;
		border-radius: 6px;
		padding: 0.75rem;
		margin: 0.5rem 0;
		background: #fafafa;
	}
	.team-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.team-header h3 { margin: 0; font-size: 1rem; }
	.member-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0;
	}
	.member-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.3rem 0;
		border-bottom: 1px solid #eee;
	}
	.add-member-form {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.add-member-form select { flex: 1; }

	/* Inline form */
	.inline-form { display: inline; }

	/* Edit popover */
	.edit-popover {
		display: inline;
		position: relative;
	}
	.edit-popover summary {
		cursor: pointer;
		color: #1a1a2e;
		font-size: 0.85rem;
	}
	.popover-form {
		position: absolute;
		right: 0;
		top: 1.5rem;
		background: #fff;
		border: 1px solid #ddd;
		border-radius: 6px;
		padding: 0.75rem;
		z-index: 10;
		min-width: 200px;
		box-shadow: 0 2px 8px rgba(0,0,0,0.1);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.actions-cell {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	/* Lists */
	.simple-list {
		list-style: none;
		padding: 0;
	}
	.simple-list li {
		padding: 0.3rem 0;
		border-bottom: 1px solid #eee;
	}

	/* States */
	.empty { color: #888; font-style: italic; font-size: 0.9rem; }
	.hint { color: #666; font-size: 0.85rem; margin-top: -0.5rem; }
	.error {
		color: #c00;
		background: #fee;
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.9rem;
	}
	.success {
		color: #060;
		background: #efe;
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.9rem;
	}
</style>
