<script lang="ts">
	let { status }: { status: string } = $props();
	const labels: Record<string, string> = { setup: 'Setup', registration_open: 'Registration open', roster_locked: 'Rosters locked', scoring: 'Scoring', finalized: 'Finalized' };
</script>

<span class="contest-status" data-status={status}>{labels[status] ?? 'Status unavailable'}</span>

<style>
	.contest-status { display: inline-block; justify-self: start; padding: .2rem .5rem; border-radius: 4px; background: #edf1f7; color: #34445e; font-size: .8rem; font-weight: 600; white-space: nowrap; }
	.contest-status[data-status="scoring"] { background: #fff2ce; color: #6a4a00; }
	.contest-status[data-status="finalized"] { background: #e2f5e8; color: #176b35; }
</style>
