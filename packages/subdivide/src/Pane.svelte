<script module lang="ts">
	import type { PaneData } from './layout/runtime.js';
	import type { SplitEdge } from './layout/types.js';
	import type { ZoneMap } from './zones.js';
	import type { FloatingPanelSide, FloatingPanelSpec } from './floatingPanel.js';

	const THRESHOLD = 100;

	/** Points the reveal chevron toward the edge its panel would slide in from. */
	function revealArrowRotation(side: FloatingPanelSide): string {
		switch (side) {
			case 'right':
				return '0deg';
			case 'left':
				return '180deg';
			case 'top':
				return '-90deg';
			case 'bottom':
				return '90deg';
		}
	}

	interface SplitEvent {
		edge: SplitEdge;
		clientX: number;
		clientY: number;
	}

	interface PaneContextMenuRequest {
		clientX: number;
		clientY: number;
	}

	interface Props {
		pane: PaneData;
		layoutTick: number;
		modifierPressed: boolean;
		zones: ZoneMap;
		zoneLabels: Record<string, string>;
		availableZones: string[];
		floatingPanels?: FloatingPanelSpec[];
		onsplit?: (event: SplitEvent) => void;
		onzonechange?: (zone: string) => void;
		oncontextmenu?: (event: PaneContextMenuRequest) => void;
		onfloatingpaneltoggle?: (panelId: string) => void;
	}
</script>

<script lang="ts">
	import PaneHeader from './PaneHeader.svelte';
	import { NORTH, SOUTH, EAST, WEST, isModifierPressed } from './layout/constants.js';

	let {
		pane,
		layoutTick,
		modifierPressed,
		zones,
		zoneLabels,
		availableZones,
		floatingPanels,
		onsplit,
		onzonechange,
		oncontextmenu,
		onfloatingpaneltoggle
	}: Props = $props();

	let innerEl = $state<HTMLDivElement | null>(null);
	let edge = $state<SplitEdge | null>(null);
	/** Mouse-over state for this pane specifically — the "active" division, Blender-style.
	 *  Drives both the border highlight and which pane's own `N` keypress responds. */
	let hovered = $state(false);

	const frame = $derived.by(() => {
		layoutTick;
		return {
			left: pane.getLeft() * 100,
			top: pane.getTop() * 100,
			width: pane.getWidth() * 100,
			height: pane.getHeight() * 100,
			zone: pane.zone
		};
	});

	const panelsForZone = $derived(
		(floatingPanels ?? []).filter((panel) => panel.zone === frame.zone)
	);

	// Optional — a pane whose zone has no configured label just doesn't get a header row.
	const paneTitle = $derived(zoneLabels[frame.zone]);

	const cursor = $derived.by(() => {
		if (!modifierPressed || !edge) return undefined;

		if (edge === NORTH) return 's-resize';
		if (edge === SOUTH) return 'n-resize';
		if (edge === WEST) return 'e-resize';
		if (edge === EAST) return 'w-resize';
		return undefined;
	});

	function findEdge(event: MouseEvent): SplitEdge | null {
		if (!innerEl) return null;

		const { top, right, bottom, left } = innerEl.getBoundingClientRect();

		const distances: [SplitEdge, number][] = [
			[NORTH, event.clientY - top],
			[SOUTH, bottom - event.clientY],
			[EAST, right - event.clientX],
			[WEST, event.clientX - left]
		];

		if (
			distances[0]![1] > THRESHOLD &&
			distances[1]![1] > THRESHOLD &&
			distances[2]![1] > THRESHOLD &&
			distances[3]![1] > THRESHOLD
		) {
			return null;
		}

		distances.sort((a, b) => a[1] - b[1]);
		return distances[0]![0];
	}

	function handleInnerMousedown(event: MouseEvent) {
		if (!modifierPressed && !isModifierPressed(event)) return;

		const found = findEdge(event);
		if (!found) return;

		event.preventDefault();
		event.stopPropagation();

		onsplit?.({
			edge: found,
			clientX: event.clientX,
			clientY: event.clientY
		});
	}

	function handleInnerMousemove(event: MouseEvent) {
		edge = findEdge(event);
	}

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		if (target.closest('.cm-editor, .cm-content')) return true;
		const tag = target.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
	}

	// Only the pane the mouse is currently over responds to `N` — other panes (and their own
	// floating panels, if any) are unaffected, so multiple panes can each host an independent
	// side panel without one `N` press toggling all of them at once.
	function handleWindowKeydown(event: KeyboardEvent) {
		if (!hovered || event.repeat) return;
		if (isEditableTarget(event.target)) return;
		if (event.key !== 'n' && event.key !== 'N') return;
		if (panelsForZone.length === 0) return;

		event.preventDefault();
		for (const panel of panelsForZone) {
			onfloatingpaneltoggle?.(panel.id);
		}
	}

	function handleContextMenu(event: MouseEvent) {
		if (isEditableTarget(event.target)) return;
		if (!oncontextmenu) return;
		event.preventDefault();
		event.stopPropagation();
		oncontextmenu({ clientX: event.clientX, clientY: event.clientY });
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div
	class="pane"
	style:left="{frame.left}%"
	style:top="{frame.top}%"
	style:width="{frame.width}%"
	style:height="{frame.height}%"
>
	<div
		bind:this={innerEl}
		class="inner"
		class:hovered
		role="tabpanel"
		tabindex="0"
		aria-label={zoneLabels[frame.zone] ?? frame.zone}
		style:cursor
		onmousedown={handleInnerMousedown}
		onmousemove={handleInnerMousemove}
		onmouseenter={() => (hovered = true)}
		onmouseleave={() => (hovered = false)}
		oncontextmenu={handleContextMenu}
	>
		<PaneHeader
			paneId={pane.id}
			zone={frame.zone}
			{availableZones}
			{zoneLabels}
			title={paneTitle}
			onzonechange={(zone) => onzonechange?.(zone)}
		/>
		{#key frame.zone}
			<div class="zone-content">
				{#if zones[frame.zone]}
					{@render zones[frame.zone]!(pane.id)}
				{/if}
			</div>
		{/key}

		{#each panelsForZone as panel (panel.id)}
			{#if panel.open}
				<div
					class="floating-panel floating-panel--{panel.side}"
					class:floating-panel--stretch={panel.stretch}
					style:--floating-panel-size={panel.size ?? '240px'}
				>
					{@render panel.snippet()}
				</div>
			{:else}
				<button
					type="button"
					class="panel-reveal-tab panel-reveal-tab--{panel.side}"
					aria-label="Show panel"
					title="Show panel (N)"
					onclick={() => onfloatingpaneltoggle?.(panel.id)}
				>
					<span class="panel-reveal-arrow" style:transform="rotate({revealArrowRotation(panel.side)})"
						>&lsaquo;</span
					>
				</button>
			{/if}
		{/each}
	</div>
</div>

<style>
	/* Shell does not capture pointer events — only .inner and dividers do. */
	.pane {
		position: absolute;
		z-index: 0;
		overflow: hidden;
		box-sizing: border-box;
		padding: calc(var(--thickness) / 2);
		pointer-events: none;
	}

	.inner {
		--pane-title-bar-height: 24px;
		position: relative;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		overflow: hidden;
		pointer-events: auto;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		transition: border-color 0.1s ease;
	}

	/* The pane the mouse is currently over — Blender's "active area" convention. */
	.inner.hovered {
		border-color: rgba(255, 255, 255, 0.35);
	}

	.zone-content {
		/* Flex column bounds the (single) child panel to the pane box; the pane only
		   clips. Child panels own their scrolling (they set overflow:auto). */
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		width: 100%;
		flex: 1;
		min-height: 0;
		min-width: 0;
		overflow: hidden;
	}

	/* The panel root must fill the pane AND be shrinkable, so its own overflow:auto
	   scrolls internally instead of growing past the pane (the flex min-height:0 gotcha). */
	.zone-content > :global(*) {
		flex: 1;
		min-height: 0;
		min-width: 0;
	}

	/* Overlays this pane's own content — reserves no grid space, so the pane keeps its full
	   size whether the panel is open or closed. Scoped to .inner, so it tracks this specific
	   pane's bounds (position, size) rather than the whole Subdivide layout.

	   Default: sized to content along the cross axis, anchored to a corner, capped at the
	   pane's available size with its own scrollbar if content overflows -- like Blender's own
	   panels, which grow with their content rather than always spanning the whole edge.
	   `stretch` opts into the old always-full-height/width behavior instead. */
	.floating-panel {
		position: absolute;
		z-index: 2;
		overflow: auto;
		pointer-events: auto;
		background: var(--floating-panel-bg, #1a1f30);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	}

	/* top always clears the (always-present) pane header, not just the pane's own 8px inset. */
	.floating-panel--left,
	.floating-panel--right {
		top: calc(var(--pane-title-bar-height) + 8px);
		width: var(--floating-panel-size);
		max-height: calc(100% - var(--pane-title-bar-height) - 16px);
	}

	.floating-panel--top,
	.floating-panel--bottom {
		left: 8px;
		height: var(--floating-panel-size);
		max-width: calc(100% - 16px);
	}

	.floating-panel--left {
		left: 8px;
	}

	.floating-panel--right {
		right: 8px;
	}

	.floating-panel--top {
		top: calc(var(--pane-title-bar-height) + 8px);
	}

	.floating-panel--bottom {
		bottom: 8px;
	}

	.floating-panel--stretch.floating-panel--left,
	.floating-panel--stretch.floating-panel--right {
		bottom: 8px;
		max-height: none;
	}

	.floating-panel--stretch.floating-panel--top,
	.floating-panel--stretch.floating-panel--bottom {
		left: 0;
		right: 0;
		max-width: none;
	}

	/* Shown at a panel's docking edge when it's closed — Blender's own collapsed-sidebar
	   affordance: a small square chevron tab hinting a panel can be revealed there. Sits near
	   the start of the edge (not centered), matching Blender's own placement. */
	.panel-reveal-tab {
		position: absolute;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.55);
		cursor: pointer;
		pointer-events: auto;
	}

	.panel-reveal-tab:hover {
		background: rgba(255, 255, 255, 0.14);
		color: rgba(255, 255, 255, 0.9);
	}

	/* top always sits 1em below the (always-present) pane header. */
	.panel-reveal-tab--left,
	.panel-reveal-tab--right,
	.panel-reveal-tab--top {
		top: calc(var(--pane-title-bar-height) + 1em);
	}

	.panel-reveal-tab--top,
	.panel-reveal-tab--bottom {
		left: 4em;
	}

	.panel-reveal-tab--left {
		left: 8px;
	}

	.panel-reveal-tab--right {
		right: 8px;
	}

	.panel-reveal-tab--bottom {
		bottom: 8px;
	}

	.panel-reveal-arrow {
		font-size: 16px;
		line-height: 1;
	}
</style>
