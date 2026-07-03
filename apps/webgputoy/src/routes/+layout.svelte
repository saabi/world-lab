<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
</svelte:head>

<a class="skip-link" href="#main-content">Skip to editor</a>

<main id="main-content" tabindex="-1">
	{@render children()}
</main>

<style>
	.skip-link {
		position: absolute;
		z-index: 2000;
		top: 8px;
		left: 8px;
		transform: translateY(-160%);
		width: auto;
		border: 1px solid rgba(120, 170, 255, 0.65);
		border-radius: 6px;
		background: #151a28;
		color: #e8ecf8;
		padding: 7px 10px;
		font-size: 12px;
		font-weight: 600;
		text-decoration: none;
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
	}

	.skip-link:focus-visible {
		transform: translateY(0);
		outline: 1px solid rgba(120, 170, 255, 0.85);
		outline-offset: 2px;
	}

	main {
		width: 100%;
		height: 100%;
		min-height: 100vh;
	}

	main:focus {
		outline: none;
	}
</style>
