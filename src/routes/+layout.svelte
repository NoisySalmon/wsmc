<script lang="ts">
	let { children, data } = $props();
	const nav = $derived(data?.nav as { isSystem: boolean; isSeasonCoordinator: boolean; isRegional: boolean; isCoach: boolean; isScorekeeper: boolean } | null | undefined);
	const principal = $derived(data?.principal);
	const showProgram = $derived(Boolean(nav?.isSystem || nav?.isSeasonCoordinator));
	// Schools/Participation are shown to system + season coordinators; regional coordinators
	// manage schools through their contest Overview / Participation scope instead.
	const showDirectory = $derived(Boolean(nav?.isSystem || nav?.isSeasonCoordinator));
	const showUsers = $derived(Boolean(principal?.statewideSeasonIds.includes(null)));
</script>

<svelte:head>
	<link rel="icon" href="data:image/svg+xml,🧮" />
</svelte:head>

<a class="skip-link" href="#main-content">Skip to main content</a>
<nav aria-label="Primary navigation">
	<a href="/">WSMC</a>
	{#if showProgram}<a href="/program">Program</a>{/if}
	{#if showDirectory}<a href="/schools">Schools</a>{/if}
	{#if showDirectory || nav?.isRegional}<a href="/participation">Participation</a>{/if}
	{#if nav?.isCoach}<a href="/my-schools">My schools</a>{/if}
	{#if showUsers}<a href="/admin/users">Users</a>{/if}
	{#each data?.roleLinks ?? [] as link}<a href={link.href}>{link.label}</a>{/each}
	{#if principal}<form method="POST" action="/auth/sign-out"><button type="submit">Sign out</button></form>{/if}
</nav>

<div id="main-content">
	{@render children()}
</div>

<style>
	:global(body) {
		font-family: system-ui, -apple-system, sans-serif;
		margin: 0;
		padding: 0;
		color: #1a1a1a;
	}
	.skip-link {
		position: absolute;
		left: 1rem;
		top: -4rem;
		z-index: 10;
		padding: 0.6rem 0.8rem;
		background: #fff;
		color: #1a1a2e;
		border: 2px solid #1a1a2e;
		border-radius: 4px;
	}
	.skip-link:focus { top: 1rem; }
	:global(a:focus-visible), :global(button:focus-visible), :global(input:focus-visible), :global(select:focus-visible), :global(textarea:focus-visible) {
		outline: 3px solid #e05a00;
		outline-offset: 2px;
	}
	nav {
		background: #1a1a2e;
		padding: 0.75rem 2rem;
		display: flex;
		flex-wrap: wrap;
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
	@media (max-width: 620px) {
		nav { padding: 0.75rem 1rem; gap: 0.75rem; }
		nav form { margin-left: 0; }
	}
</style>
