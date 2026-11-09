<script lang="ts">
	import { onMount } from 'svelte';
	let { qr }: { qr: { image: string; signInUrl: string; tokenId: string; userId: string; email: string; displayName: string; expiresAt: number } } = $props();
	let now = $state(Date.now());
	let remaining = $derived(Math.max(0, Math.ceil((qr.expiresAt - now) / 1000)));
	onMount(() => {
		const timer = setInterval(() => { now = Date.now(); }, 1000);
		return () => clearInterval(timer);
	});
</script>

<section class="qr-sign-in" aria-labelledby="qr-title" tabindex="-1">
	<h2 id="qr-title">Sign in as {qr.displayName || qr.email}</h2>
	<p>{qr.email}</p>
	{#if remaining > 0}
		<img src={qr.image} alt="Single-use sign-in QR code for {qr.email}" width="320" height="320" />
		<p>Ask this person to scan with their phone camera and open the link.</p>
		<details><summary>Sign-in link if the camera cannot scan</summary><label>Single-use sign-in link <input readonly value={qr.signInUrl} /></label></details>
		<p>Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}. It can be used once.</p>
	{:else}
		<p role="status">This code has expired. Generate a new code if needed.</p>
	{/if}
	<p>Anyone who scans this code can sign in as this person. Show it only to them. Earlier unused sign-in links and codes have been replaced.</p>
	<form method="POST" action="?/revokeQr">
		<input type="hidden" name="userId" value={qr.userId} />
		<input type="hidden" name="tokenId" value={qr.tokenId} />
		<button type="submit">Close and revoke code</button>
	</form>
</section>

<style>
	.qr-sign-in { margin: 1.5rem 0; padding: 1rem; border: 2px solid #1a1a2e; border-radius: .5rem; background: #fff; color: #1a1a2e; text-align: center; overflow-wrap: anywhere; }
	img { display: block; width: min(100%, 320px); height: auto; margin: 1rem auto; }
	label { display: grid; gap: .5rem; margin-top: .5rem; }
	input { box-sizing: border-box; width: 100%; padding: .5rem; font: inherit; }
	button { min-height: 2.75rem; padding: .55rem .8rem; border: 0; border-radius: 4px; background: #1a1a2e; color: white; cursor: pointer; font: inherit; }
</style>
