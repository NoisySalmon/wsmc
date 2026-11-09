<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	function schoolDivision(schoolId: string): number {
		return (data.schools.find((school: { id: string }) => school.id === schoolId) as { division?: number } | undefined)?.division ?? 1;
	}
	function coachesFor(schoolId: string, contestId: string) {
		const seasonId = data.contests.find((contest) => contest.id === contestId)?.seasonId;
		return data.coachAssignments.filter((assignment) => assignment.schoolId === schoolId && assignment.seasonId === seasonId);
	}
	let inviteSchoolId = $state('');
	$effect(() => {
		if (!inviteSchoolId && data.schools[0]?.id) inviteSchoolId = data.schools[0].id;
	});
</script>

<svelte:head><title>Participation — WSMC</title></svelte:head>

<main>
	<h1>Contest participation</h1>
	<p>Regional coordinators invite schools to their contest. To move a school between regions — including the Virtual catch-all region for schools outside a cluster or unable to attend their home contest — remove it here and re-invite it to the correct contest. The invitation defaults to the school's record division. {#if data.canAddSchools}New schools can be added under <a href="/schools">Schools</a>.{/if}</p>
	{#if form?.error}<p class="error">{form.error}</p>{/if}{#if form?.success}<p class="success">{form.success}</p>{/if}

	<section class="forms"><div><h2>Invite a school</h2><form method="POST" action="?/invite" use:enhance>
		<label>Contest <select name="contestId" required>{#each data.contests as contest}<option value={contest.id}>{contest.name}</option>{/each}</select></label>
		<label>School <select name="schoolId" required bind:value={inviteSchoolId}>{#each data.schools as school}<option value={school.id}>{school.name} (Div {school.division ?? 1})</option>{/each}</select></label>
		<label>Division <select name="division"><option value="">School record ({schoolDivision(inviteSchoolId)})</option><option value="1">Division 1 override</option><option value="2">Division 2 override</option></select></label><button type="submit">Send invitation</button>
	</form></div></section>

	<section><h2>Participations</h2><ul>{#each data.participations as participation}<li><div><strong>{data.schools.find((school) => school.id === participation.schoolId)?.name ?? participation.schoolId}</strong><span>{data.contests.find((contest) => contest.id === participation.contestId)?.name ?? participation.contestId} · Division {participation.division} · {participation.invitationStatus}</span><span class="coaches"><strong>Coach:</strong> {#each coachesFor(participation.schoolId, participation.contestId) as coach, i}{i ? '; ' : ''}{coach.displayName || coach.email}{:else}No coach assigned{/each}</span>{#if data.contests.find((contest) => contest.id === participation.contestId)?.kind === 'regional'}<a href="/contests/{participation.contestId}">Open contest overview</a><a href="/contests/{participation.contestId}/staff#school-{participation.schoolId}">Manage coaches</a>{/if}<a href="/registration/{participation.contestId}/{participation.schoolId}">Open registration</a><a href="/reports/participation?contestId={participation.contestId}">Download participation CSV</a></div><div class="actions"><form method="POST" action="?/respond" use:enhance><input type="hidden" name="participationId" value={participation.id} /><input type="hidden" name="contestId" value={participation.contestId} /><input type="hidden" name="status" value="accepted" /><button type="submit" disabled={participation.invitationStatus === 'accepted'}>{participation.invitationStatus === 'accepted' ? 'Accepted' : 'Accept'}</button></form><form method="POST" action="?/respond" use:enhance><input type="hidden" name="participationId" value={participation.id} /><input type="hidden" name="contestId" value={participation.contestId} /><input type="hidden" name="status" value="declined" /><button type="submit" disabled={participation.invitationStatus === 'declined'}>{participation.invitationStatus === 'declined' ? 'Declined' : 'Decline'}</button></form><form method="POST" action="?/withdraw" use:enhance><input type="hidden" name="participationId" value={participation.id} /><input type="hidden" name="contestId" value={participation.contestId} /><button type="submit">Remove participation</button></form></div></li>{/each}</ul></section>

</main>

<style>
	main { max-width: 1000px; margin: 0 auto; padding: 2rem; } section { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; } .forms { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; } .forms > div { padding: 1rem; border: 1px solid #ddd; border-radius: 6px; } form { display: flex; flex-direction: column; gap: 0.65rem; } label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; } input, select { padding: 0.5rem; font: inherit; border: 1px solid #bbb; border-radius: 4px; } button { background: #1a1a2e; color: white; border: 0; border-radius: 4px; padding: 0.5rem 0.75rem; cursor: pointer; align-self: flex-start; } ul { list-style: none; padding: 0; } li { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid #eee; } li > div:first-child { min-width: 0; overflow-wrap: anywhere; display: flex; flex-direction: column; gap: 0.2rem; } li span { color: #666; } .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; flex-shrink: 0; } .coaches { margin: 0.35rem 0; } button:disabled { background: #e2f5e8; color: #176b35; cursor: default; } .actions form { display: block; } .actions button { font-size: 0.85rem; min-height: 2.5rem; } .actions button:disabled { background: #e2f5e8; color: #176b35; } .error, .success { padding: 0.6rem; border-radius: 4px; } .error { background: #fbe3e3; color: #9a2020; } .success { background: #e2f5e8; color: #176b35; } @media (max-width: 750px) { .forms { grid-template-columns: 1fr; } li { align-items: flex-start; flex-direction: column; } }
</style>
