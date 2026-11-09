<script lang="ts">
	import { enhance } from '$app/forms';
	import { contestDate, contestDateInput } from '$lib/contest-date';
	let { contest, canManage }: { contest: { startsAt: number | null; lifecycle: string }; canManage: boolean } = $props();
	const next: Record<string, string> = { setup:'registration_open', registration_open:'roster_locked', roster_locked:'scoring' };
	const labels: Record<string, string> = { setup:'Open registration', registration_open:'Lock rosters', roster_locked:'Start scoring' };
</script>
{#if canManage && contest.lifecycle !== 'finalized'}
	<section aria-label="Contest settings">
		<form use:enhance method="POST" action="?/updateDate"><label>Contest date <input type="date" name="startsAt" value={contestDateInput(contest.startsAt)} /></label><button type="submit">Save date</button></form>
		{#if next[contest.lifecycle]}<form use:enhance method="POST" action="?/advanceLifecycle"><input type="hidden" name="lifecycle" value={next[contest.lifecycle]} /><button type="submit">{labels[contest.lifecycle]}</button></form>{/if}
	</section>
{:else}<p>Contest date: {contestDate(contest.startsAt)}</p>{/if}
<style>
	section { display:flex; align-items:end; flex-wrap:wrap; gap:1rem 2rem; padding:1rem 0; } form { display:flex; align-items:end; flex-wrap:wrap; gap:.75rem; } label { display:flex; flex-direction:column; gap:.4rem; font-weight:600; } input { font:inherit; padding:.55rem; border:1px solid #aeb6c2; border-radius:4px; } button { min-height:2.75rem; padding:.6rem .8rem; border:0; border-radius:4px; background:#1a1a2e; color:white; cursor:pointer; }
</style>
