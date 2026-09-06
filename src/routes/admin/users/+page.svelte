<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>User administration — WSMC</title>
</svelte:head>

<main>
	<h1>User administration</h1>
	<p>Invite coordinators, coaches, and scorekeepers. Each new link invalidates earlier outstanding links for that user.</p>

	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if form?.success}<p class="success">{form.success}</p>{/if}

	<section>
		<h2>Invite or add access</h2>
		<form method="POST" action="?/invite">
			<label>Email <input type="email" name="email" autocomplete="email" required /></label>
			<label>Name <input type="text" name="displayName" autocomplete="name" required /></label>
			<label>Assignment
				<select name="role" required>
					<option value="statewide">System-wide coordinator</option>
					<option value="season">Season coordinator</option>
					<option value="regional">Regional coordinator</option>
					<option value="coach">School coach</option>
					<option value="scorekeeper">Scorekeeper</option>
				</select>
			</label>
			<label>Season (for season coordinator or coach)
				<select name="seasonId">
					<option value="">Select a season</option>
					{#each data.seasons as season}<option value={season.id}>{season.year} — {season.name}</option>{/each}
				</select>
			</label>
			<label>Contest (for regional coordinator or scorekeeper)
				<select name="contestId">
					<option value="">Select a contest</option>
					{#each data.contests as contest}<option value={contest.id}>{contest.name} ({contest.kind})</option>{/each}
				</select>
			</label>
			<label>School (for coach)
				<select name="schoolId">
					<option value="">Select a school</option>
					{#each data.schools as school}<option value={school.id}>{school.name}</option>{/each}
				</select>
			</label>
			<button type="submit">Send invitation</button>
		</form>
	</section>

	<section>
		<h2>Users</h2>
		<ul class="users">
			{#each data.users as user}
				<li>
					<div><strong>{user.displayName || user.email}</strong><span>{user.email}</span><span class="status {user.status}">{user.status}</span></div>
					<div class="actions">
						<form method="POST" action="?/revoke"><input type="hidden" name="userId" value={user.id} /><button type="submit">Revoke links/sessions</button></form>
						{#if user.status === 'disabled'}
							<form method="POST" action="?/enable"><input type="hidden" name="userId" value={user.id} /><button type="submit">Enable</button></form>
						{:else}
							<form method="POST" action="?/disable"><input type="hidden" name="userId" value={user.id} /><button type="submit">Disable</button></form>
						{/if}
					</div>
					<div class="assignments">
						{#each data.assignments.statewide.filter((assignment) => assignment.userId === user.id) as assignment}<form method="POST" action="?/removeAssignment"><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="assignmentKind" value="statewide" /><input type="hidden" name="seasonId" value={assignment.seasonId ?? ''} /><span>Statewide {assignment.seasonId ?? 'system'}</span><button type="submit">Remove</button></form>{/each}
						{#each data.assignments.regional.filter((assignment) => assignment.userId === user.id) as assignment}<form method="POST" action="?/removeAssignment"><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="assignmentKind" value="regional" /><input type="hidden" name="contestId" value={assignment.contestId} /><span>Regional {assignment.contestId}</span><button type="submit">Remove</button></form>{/each}
						{#each data.assignments.coach.filter((assignment) => assignment.userId === user.id) as assignment}<form method="POST" action="?/removeAssignment"><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="assignmentKind" value="coach" /><input type="hidden" name="seasonId" value={assignment.seasonId} /><input type="hidden" name="schoolId" value={assignment.schoolId} /><span>Coach {assignment.schoolId} ({assignment.seasonId})</span><button type="submit">Remove</button></form>{/each}
						{#each data.assignments.scorekeeper.filter((assignment) => assignment.userId === user.id) as assignment}<form method="POST" action="?/removeAssignment"><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="assignmentKind" value="scorekeeper" /><input type="hidden" name="contestId" value={assignment.contestId} /><span>Scorekeeper {assignment.contestId}</span><button type="submit">Remove</button></form>{/each}
					</div>
				</li>
			{/each}
		</ul>
	</section>
</main>

<style>
	main { max-width: 900px; margin: 0 auto; padding: 2rem; }
	section { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; }
	form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 32rem; }
	label { display: flex; flex-direction: column; gap: 0.25rem; font-weight: 600; }
	input, select { padding: 0.55rem; border: 1px solid #bbb; border-radius: 4px; font: inherit; }
	button { padding: 0.55rem 0.8rem; border: 0; border-radius: 4px; background: #1a1a2e; color: white; cursor: pointer; }
	.users { list-style: none; padding: 0; }
	.users li { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0.9rem 0; border-bottom: 1px solid #eee; }
	.users li div:first-child { display: flex; gap: 0.75rem; align-items: baseline; flex-wrap: wrap; }
	.users span { color: #666; }
	.status { padding: 0.15rem 0.4rem; border-radius: 4px; background: #eee; font-size: 0.8rem; }
	.status.active { background: #e2f5e8; color: #176b35; }
	.status.disabled { background: #fbe3e3; color: #9a2020; }
	.actions { display: flex; gap: 0.5rem; }
	.actions form { display: block; }
	.actions button { background: #555; font-size: 0.85rem; }
	.assignments { display: flex; flex-direction: column; gap: 0.3rem; }
	.assignments form { display: flex; flex-direction: row; align-items: center; gap: 0.4rem; }
	.assignments span { font-size: 0.8rem; }
	.assignments button { background: #777; font-size: 0.75rem; padding: 0.25rem 0.4rem; }
	.error, .success { padding: 0.6rem; border-radius: 4px; }
	.error { color: #9a2020; background: #fbe3e3; }
	.success { color: #176b35; background: #e2f5e8; }
	@media (max-width: 700px) { .users li { align-items: flex-start; flex-direction: column; } }
</style>
