<script lang="ts">
	let { children, data } = $props();
	const nav = $derived(data?.nav as { isAdmin: boolean; isRegional: boolean; isCoach: boolean; isScorekeeper: boolean } | null | undefined);
	let administrationOpen = $state(false);
	const activeStateContest = $derived(data?.activeStateContest);
	const principal = $derived(data?.principal);
	// Administrators have the school directory; regional coordinators
	// manage schools through their contest overview instead.
	const showDirectory = $derived(Boolean(nav?.isAdmin));
	const showUsers = $derived(Boolean(nav?.isAdmin));
</script>

<svelte:head>
	<link rel="icon" href="data:image/svg+xml,🧮" />
</svelte:head>

<a class="skip-link" href="#main-content">Skip to main content</a>
<nav aria-label="Primary navigation">
	<a href="/">WSMC</a>
	{#if activeStateContest}<a href="/state/{activeStateContest.id}">State contest</a>{/if}
	{#if showDirectory}
  {#if activeStateContest}<details class="administration" bind:open={administrationOpen}><summary>Administration</summary><div><a href="/schools" onclick={() => administrationOpen=false}>Schools</a><a href="/regions" onclick={() => administrationOpen=false}>Regions</a></div></details>
  {:else}<a href="/schools">Schools</a><a href="/regions">Regions</a>{/if}
 {/if}
	{#if nav?.isCoach}<a href="/my-schools">My schools</a>{/if}
	{#if showUsers}<a href="/admin/users">Users &amp; access</a>{/if}
	{#each data?.roleLinks ?? [] as link}<a href={link.href}>{link.label}</a>{/each}
	<a href="/help">Help</a>
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
		outline: 3px solid #2563eb;
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
	nav > a:first-child {
		font-weight: 700;
		font-size: 1.1rem;
		color: #fff;
	}
	nav a:hover {
		color: #fff;
	}
 .administration{position:relative;color:#e0e0e0}.administration summary{cursor:pointer;font-weight:500}.administration summary:hover{color:white}.administration>div{position:absolute;top:calc(100% + .75rem);left:0;z-index:20;min-width:160px;display:grid;gap:.25rem;padding:.5rem;background:#1a1a2e;border:1px solid #555;border-radius:6px;box-shadow:0 6px 18px #0003}.administration a{padding:.5rem .75rem}.administration a:hover{background:#303047;border-radius:4px}
	nav form { margin-left: auto; }
	nav button { background: transparent; border: 1px solid #777; color: #e0e0e0; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; }
	@media (max-width: 620px) {
		nav { padding: 0.75rem 1rem; gap: 0.75rem; }
		nav form { margin-left: 0; }
	}
</style>
