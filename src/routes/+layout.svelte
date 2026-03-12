<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="data:image/svg+xml,🧮" />
</svelte:head>

<nav>
	<a href="/">WSMC</a>
	<a href="/contests">Contests</a>
</nav>

{@render children()}

<style>
	:global(body) {
		font-family: system-ui, -apple-system, sans-serif;
		margin: 0;
		padding: 0;
		color: #1a1a1a;
	}
	nav {
		background: #1a1a2e;
		padding: 0.75rem 2rem;
		display: flex;
		gap: 1.5rem;
		align-items: center;
	}
	nav a {
		color: #e0e0e0;
		text-decoration: none;
		font-weight: 500;
	}
	nav a:first-child {
		font-weight: 700;
		font-size: 1.1rem;
		color: #fff;
	}
	nav a:hover {
		color: #fff;
	}
</style>
