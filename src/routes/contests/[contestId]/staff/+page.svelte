<script lang="ts">
	import QrSignIn from '$lib/components/QrSignIn.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>{data.contest.name} people — WSMC</title></svelte:head>
<main>
	<p><a href="/contests/{data.contest.id}">← {data.contest.name}</a></p>
	<h1>People · {data.contest.name}</h1>
	<p>Add people by email. Existing accounts receive access without an email; new accounts receive a sign-in invitation. Disabled accounts must be re-enabled by an administrator.</p>
	{#if data.contest.archived}<p>This season is archived. These lists show current coordinator and coach access. Manage access from the current season or Users &amp; access.</p>{/if}
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}{#if form?.success}<p class="success" role="status">{form.success}</p>{/if}

	{#if form?.qr}<QrSignIn qr={form.qr} />{/if}
	<p>Use Show sign-in QR to sign someone in without email. Accounts with coordinator access need an administrator to generate their code.</p>

	{#snippet addForm(role: string, schoolId = '')}
		<form method="POST" action="?/add">
			<input type="hidden" name="role" value={role} /><input type="hidden" name="schoolId" value={schoolId} />
			<label>Email <input type="email" name="email" required /></label>
			<label>Name (required for new accounts) <input name="displayName" /></label>
			<button type="submit">Add {role === 'regional' ? 'regional coordinator' : role}</button>
		</form>
	{/snippet}
	{#snippet personRow(person: { userId: string; displayName: string; email: string; status: string; canGenerateQr: boolean }, role: string, schoolId = '', manageable = true)}
		<li><div><strong>{person.displayName || person.email}</strong><span>{person.email} · {person.status}</span></div>
		{#if manageable && !data.contest.archived}<div class="actions">
			{#if person.canGenerateQr}<form method="POST" action="?/qr"><input type="hidden" name="userId" value={person.userId} /><button type="submit">Show sign-in QR</button></form>{/if}
			{#if person.status === 'pending'}<form method="POST" action="?/resend"><input type="hidden" name="role" value={role} /><input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="userId" value={person.userId} /><button class="quiet" type="submit">Resend invitation</button></form>{/if}
			<form method="POST" action="?/remove"><input type="hidden" name="role" value={role} /><input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="userId" value={person.userId} /><button class="quiet" type="submit">{role === 'scorekeeper' ? 'Remove from this contest' : 'Remove access'}</button></form>
		</div>{/if}</li>
	{/snippet}

	<section><h2>Regional coordinators</h2><p>Coordinator access applies to this region across seasons.</p>
		<ul>{#each data.coordinators as person}{@render personRow(person, 'regional', '', data.canManageCoordinators)}{:else}<li>No regional coordinators assigned.</li>{/each}</ul>
		{#if data.canManageCoordinators && !data.contest.archived}{@render addForm('regional')}{/if}
	</section>
	<section><h2>Scorekeepers</h2>
		<ul>{#each data.scorekeepers as person}{@render personRow(person, 'scorekeeper')}{:else}<li>No scorekeepers assigned.</li>{/each}</ul>
		{#if !data.contest.archived}{@render addForm('scorekeeper')}{/if}
	</section>
	<section><h2>School coaches</h2><p>Coach access belongs to the school across seasons and stays with it when it moves between contests. Adding or removing a coach here affects every season.</p>
		{#each data.schools as school}<section id="school-{school.id}"><h3>{school.name}</h3>
			<ul>{#each data.coaches.filter((coach) => coach.schoolId === school.id) as person}{@render personRow(person, 'coach', school.id)}{:else}<li>No coaches assigned.</li>{/each}</ul>
			{#if !data.contest.archived}{@render addForm('coach', school.id)}{/if}
		</section>{:else}<p>Assign a school through <a href="/regions">Regions</a> before adding its coaches.</p>{/each}
	</section>
</main>
<style>
	.actions { display: flex; flex-wrap: wrap; gap: .5rem; }

	main { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
	section { margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: 1rem; }
	ul { list-style: none; padding: 0; } li { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: .75rem 0; border-bottom: 1px solid #eee; } li div { display: grid; gap: .2rem; } li span { color: #596273; }
	form { display: grid; gap: .7rem; max-width: 30rem; } label { display: grid; gap: .25rem; font-weight: 600; } input { box-sizing: border-box; min-height: 2.75rem; padding: .55rem; font: inherit; border: 1px solid #aaa; border-radius: 4px; }
	button { min-height: 2.75rem; padding: .55rem .8rem; border: 0; border-radius: 4px; background: #1a1a2e; color: white; cursor: pointer; justify-self: start; } button.quiet { background: #555; }
	.error, .success { padding: .6rem; border-radius: 4px; }.error { background: #fbe3e3; color: #9a2020; }.success { background: #e2f5e8; color: #176b35; }
	@media (max-width: 620px) { li { align-items: flex-start; flex-direction: column; } }
</style>
