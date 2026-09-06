<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Sign in · WSMC</title></svelte:head>

<main>
	<h1>Sign in to WSMC</h1>
	<p>Enter your invited email address and we’ll send a one-time sign-in link.</p>
	<form method="POST">
		<label for="email">Email address</label>
		<input id="email" name="email" type="email" autocomplete="email" required />
		<input type="hidden" name="next" value={data.next} />
		<button type="submit">Email me a sign-in link</button>
	</form>
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	{#if form?.success}<p class="success">{form.message}</p>{/if}
</main>

<style>
	main { max-width: 32rem; margin: 4rem auto; padding: 0 1rem; }
	form { display: grid; gap: 0.75rem; margin-top: 2rem; }
	input { font: inherit; padding: 0.65rem; }
	button { font: inherit; padding: 0.7rem; cursor: pointer; }
	.error { color: #a00; }
	.success { color: #064; }
</style>
