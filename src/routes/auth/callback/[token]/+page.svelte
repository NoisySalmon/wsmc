<script lang="ts">
	let { form } = $props();
</script>

<svelte:head>
	<title>Confirm sign-in · WSMC</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main>
	<h1>Sign in to WSMC</h1>
	{#if form?.error}
		<p role="alert">{form.error}</p>
		<p><a href="/login">Request a new sign-in email</a>, or ask a coordinator for a new QR code.</p>
	{:else}
		<p>Press the button to finish signing in on this device.</p>
		<form method="POST"><button type="submit">Sign in</button></form>
	{/if}
</main>

<style>
	main { max-width: 32rem; margin: 4rem auto; padding: 0 1rem; }
	button { font: inherit; padding: .7rem 1.2rem; cursor: pointer; }
</style>
