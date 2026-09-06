<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Participation — WSMC</title></svelte:head>

<main>
	<h1>Contest participation</h1>
	<p>Invite active schools, collect coach responses, and manage school coach assignments.</p>
	{#if form?.error}<p class="error">{form.error}</p>{/if}{#if form?.success}<p class="success">{form.success}</p>{/if}

	<section class="forms"><div><h2>Invite a school</h2><form method="POST" action="?/invite">
		<label>Contest <select name="contestId" required>{#each data.contests as contest}<option value={contest.id}>{contest.name}</option>{/each}</select></label>
		<label>School <select name="schoolId" required>{#each data.schools as school}<option value={school.id}>{school.name}</option>{/each}</select></label>
		<label>Division <select name="division"><option value="1">Division 1</option><option value="2">Division 2</option></select></label><button type="submit">Send invitation</button>
	</form></div><div><h2>Assign a coach</h2><form method="POST" action="?/assignCoach">
		<label>User <select name="userId" required>{#each data.users as user}<option value={user.id}>{user.displayName || user.email}</option>{/each}</select></label>
		<label>Season <select name="seasonId" required>{#each data.seasons as season}<option value={season.id}>{season.year} — {season.name}</option>{/each}</select></label><label>School <select name="schoolId" required>{#each data.schools as school}<option value={school.id}>{school.name}</option>{/each}</select></label><button type="submit">Assign coach</button>
	</form></div></section>

	<section><h2>Participations</h2><ul>{#each data.participations as participation}<li><div><strong>{data.schools.find((school) => school.id === participation.schoolId)?.name ?? participation.schoolId}</strong><span>{data.contests.find((contest) => contest.id === participation.contestId)?.name ?? participation.contestId} · Division {participation.division} · {participation.invitationStatus}</span></div><div class="actions"><form method="POST" action="?/respond"><input type="hidden" name="participationId" value={participation.id} /><input type="hidden" name="contestId" value={participation.contestId} /><input type="hidden" name="status" value="accepted" /><button type="submit">Accept</button></form><form method="POST" action="?/respond"><input type="hidden" name="participationId" value={participation.id} /><input type="hidden" name="contestId" value={participation.contestId} /><input type="hidden" name="status" value="declined" /><button type="submit">Decline</button></form></div></li>{/each}</ul></section>

	<section><h2>Coach assignments</h2><ul>{#each data.coachAssignments as assignment}<li><span>{assignment.userId} → {assignment.schoolId} ({assignment.seasonId})</span><form method="POST" action="?/removeCoach"><input type="hidden" name="userId" value={assignment.userId} /><input type="hidden" name="seasonId" value={assignment.seasonId} /><input type="hidden" name="schoolId" value={assignment.schoolId} /><button type="submit">Remove</button></form></li>{/each}</ul></section>
</main>

<style>
	main { max-width: 1000px; margin: 0 auto; padding: 2rem; } section { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; } .forms { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; } .forms > div { padding: 1rem; border: 1px solid #ddd; border-radius: 6px; } form { display: flex; flex-direction: column; gap: 0.65rem; } label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; } input, select { padding: 0.5rem; font: inherit; border: 1px solid #bbb; border-radius: 4px; } button { background: #1a1a2e; color: white; border: 0; border-radius: 4px; padding: 0.5rem 0.75rem; cursor: pointer; align-self: flex-start; } ul { list-style: none; padding: 0; } li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.8rem 0; border-bottom: 1px solid #eee; } li div:first-child { display: flex; flex-direction: column; gap: 0.2rem; } li span { color: #666; } .actions { display: flex; gap: 0.4rem; } .actions form { display: block; } .actions button, li > form button { background: #555; font-size: 0.85rem; } .error, .success { padding: 0.6rem; border-radius: 4px; } .error { background: #fbe3e3; color: #9a2020; } .success { background: #e2f5e8; color: #176b35; } @media (max-width: 750px) { .forms { grid-template-columns: 1fr; } li { align-items: flex-start; flex-direction: column; } }
</style>
