<script lang="ts">
	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href="data:image/svg+xml,🧮" />
</svelte:head>

<nav>
	<a href="/">WSMC</a>
	{#if data?.principal?.statewideSeasonIds.length}<a href="/program">Program</a>{/if}
	{#if data?.principal?.statewideSeasonIds.length}<a href="/schools">Schools</a>{/if}
	{#if data?.principal?.statewideSeasonIds.includes(null)}<a href="/admin/users">Users</a>{/if}
	{#if data?.principal}<form method="POST" action="/auth/sign-out"><button type="submit">Sign out</button></form>{/if}
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
	nav form { margin-left: auto; }
	nav button { background: transparent; border: 1px solid #777; color: #e0e0e0; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; }
</style>
