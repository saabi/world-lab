<script module lang="ts">
	import type { Snippet } from 'svelte';
	import type { PaneData } from './layout/runtime.js';
	import type { SplitEdge } from './layout/types.js';

	const THRESHOLD = 100;

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
		zones: Record<string, Snippet>;
		zoneLabels: Record<string, string>;
		availableZones: string[];
		onsplit?: (event: SplitEvent) => void;
		onzonechange?: (zone: string) => void;
		oncontextmenu?: (event: PaneContextMenuRequest) => void;
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
		onsplit,
		onzonechange,
		oncontextmenu
	}: Props = $props();

	let innerEl = $state<HTMLDivElement | null>(null);
	let edge = $state<SplitEdge | null>(null);

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
		const tag = target.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
	}

	function handleContextMenu(event: MouseEvent) {
		if (isEditableTarget(event.target)) return;
		if (!oncontextmenu) return;
		event.preventDefault();
		event.stopPropagation();
		oncontextmenu({ clientX: event.clientX, clientY: event.clientY });
	}
</script>

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
		style:cursor
		onmousedown={handleInnerMousedown}
		onmousemove={handleInnerMousemove}
		oncontextmenu={handleContextMenu}
	>
		<PaneHeader
			paneId={pane.id}
			zone={frame.zone}
			{availableZones}
			{zoneLabels}
			onzonechange={(zone) => onzonechange?.(zone)}
		/>
		{#key frame.zone}
			<div class="zone-content">
				{#if zones[frame.zone]}
					{@render zones[frame.zone]!()}
				{/if}
			</div>
		{/key}
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
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		pointer-events: auto;
	}

	.zone-content {
		/* Flex column bounds the (single) child panel to the pane box; the pane only
		   clips. Child panels own their scrolling (they set overflow:auto). */
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
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
</style>
