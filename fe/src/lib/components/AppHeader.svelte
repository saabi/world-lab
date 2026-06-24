<script module lang="ts">
	export interface NavItem {
		href: string;
		label: string;
	}

	export const APP_TITLE = 'Virtual Planet';

	export const NAV_ITEMS: NavItem[] = [
		{ href: '/scene', label: 'Scene' },
		{ href: '/solar-systems', label: 'SunDog' }
	];

	export function isNavActive(href: string, pathname: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname === href || pathname.startsWith(`${href}/`);
	}
</script>

<script lang="ts">
	import { page } from '$app/state';

	const pathname = $derived(page.url.pathname);
</script>

<header class="app-header">
	<a class="brand" href="/" aria-current={pathname === '/' ? 'page' : undefined}>
		<span class="brand-title">{APP_TITLE}</span>
	</a>
	<nav class="nav" aria-label="Main">
		{#each NAV_ITEMS as item (item.href)}
			<a
				class="nav-link"
				class:active={isNavActive(item.href, pathname)}
				href={item.href}
				aria-current={isNavActive(item.href, pathname) ? 'page' : undefined}
			>
				{item.label}
			</a>
		{/each}
	</nav>
</header>

<style>
	.app-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		height: var(--app-header-height);
		padding: 0 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: #080b14;
		color: #e8ecf8;
		font: 600 12px/1 system-ui, sans-serif;
		flex-shrink: 0;
		z-index: 1000;
	}

	.brand {
		display: flex;
		align-items: center;
		color: inherit;
		text-decoration: none;
		white-space: nowrap;
	}

	.brand:hover {
		color: #c5d8ff;
	}

	.brand-title {
		letter-spacing: 0.02em;
	}

	.nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.nav::-webkit-scrollbar {
		display: none;
	}

	.nav-link {
		padding: 0.3rem 0.55rem;
		border-radius: 5px;
		color: #9aa6c4;
		text-decoration: none;
		white-space: nowrap;
		font-weight: 500;
	}

	.nav-link:hover {
		color: #e8ecf8;
		background: rgba(255, 255, 255, 0.06);
	}

	.nav-link.active {
		color: #e8ecf8;
		background: rgba(90, 130, 200, 0.35);
	}
</style>
