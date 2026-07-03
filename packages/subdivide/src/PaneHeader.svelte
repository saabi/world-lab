<script module lang="ts">
	interface Props {
		paneId: string;
		zone: string;
		availableZones: string[];
		zoneLabels: Record<string, string>;
		/** Optional — a zone with no configured label just leaves this blank. */
		title?: string;
		onzonechange?: (zone: string) => void;
	}
</script>

<script lang="ts">
	let { paneId, zone, availableZones, zoneLabels, title, onzonechange }: Props = $props();

	let menuOpen = $state(false);

	const triggerId = $derived(`subdivide-menu-${paneId}-trigger`);
	const menuListId = $derived(`subdivide-menu-${paneId}-list`);
	const paneTypeLabel = $derived(zoneLabels[zone] ?? zone);

	function toggleMenu(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		menuOpen = !menuOpen;
	}

	function selectZone(next: string, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		menuOpen = false;
		if (next !== zone) onzonechange?.(next);
	}

	function stopBubble(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<div
	class="pane-header"
	class:menu-open={menuOpen}
	role="toolbar"
	tabindex="-1"
	aria-label="Pane controls"
	onmousedown={stopBubble}
>
	<button
		type="button"
		id={triggerId}
		class="menu-trigger"
		aria-label="Change pane type"
		aria-haspopup="menu"
		aria-expanded={menuOpen}
		aria-controls={menuListId}
		title={`Change pane type (${paneTypeLabel})`}
		onclick={toggleMenu}
	>
		<span aria-hidden="true">&#9662;</span>
	</button>
	{#if title}
		<span class="pane-title">{title}</span>
	{/if}
	<ul id={menuListId} class="menu" role="menu" aria-labelledby={triggerId}>
		{#each availableZones as z (z)}
			<li role="none">
				<button
					type="button"
					role="menuitemradio"
					aria-checked={z === zone}
					class:selected={z === zone}
					onclick={(event) => selectZone(z, event)}
				>
					{zoneLabels[z] ?? z}
				</button>
			</li>
		{/each}
	</ul>
</div>

<style>
	/* Real header row now (not the old zero-size, absolutely-positioned corner triangle) --
	   the menu-trigger is a permanent fixture of every pane regardless of whether it has a
	   title, so the row itself always takes space; the title is the part that's optional. */
	.pane-header {
		position: relative;
		z-index: 3;
		flex: 0 0 var(--pane-title-bar-height, 24px);
		display: flex;
		align-items: center;
		gap: 6px;
		box-sizing: border-box;
		height: var(--pane-title-bar-height, 24px);
		padding-right: 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		pointer-events: auto;
	}

	.menu-trigger {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--pane-title-bar-height, 24px);
		height: var(--pane-title-bar-height, 24px);
		padding: 0;
		border: none;
		border-right: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0;
		background: transparent;
		color: var(--subdivide-menu-color, #4a6fa5);
		font-size: 12px;
		line-height: 1;
		cursor: pointer;
		opacity: 0.85;
	}

	.menu-trigger:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.06);
	}

	.pane-title {
		flex: 1;
		min-width: 0;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.02em;
		opacity: 0.75;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.menu {
		display: none;
		position: absolute;
		top: 100%;
		left: 0;
		min-width: 9rem;
		margin: 0;
		padding: 4px 0;
		list-style: none;
		background: var(--subdivide-menu-bg, #2a3142);
		border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
		border-radius: 4px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
		pointer-events: auto;
	}

	.pane-header.menu-open .menu {
		display: block;
	}

	.menu li {
		margin: 0;
	}

	.menu button {
		display: block;
		width: 100%;
		padding: 5px 12px;
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.8125rem;
		text-align: left;
		cursor: pointer;
	}

	.menu button:hover {
		background: color-mix(in srgb, currentColor 8%, transparent);
	}

	.menu button.selected {
		background: color-mix(in srgb, var(--subdivide-menu-color, #4a6fa5) 35%, transparent);
		font-weight: 600;
	}
</style>
