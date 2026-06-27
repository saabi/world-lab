<script lang="ts">
	import { TAB_ICONS, type TabIconId } from './tabIcons.js';

	let { name, size = 18 }: { name: TabIconId; size?: number } = $props();

	const def = $derived(TAB_ICONS[name]);
</script>

<svg
	class="tab-icon"
	width={size}
	height={size}
	viewBox={def.viewBox}
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#each def.paths as pathHtml (pathHtml)}
		{@html pathHtml}
	{/each}
</svg>

<style>
	.tab-icon {
		display: block;
		flex-shrink: 0;
	}
</style>
