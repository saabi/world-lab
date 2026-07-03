<script module lang="ts">
	import type { LayoutDocument } from './layout/types.js';
	import type { SplitEdge } from './layout/types.js';
	import type { PaneContextAction, PaneContextEvent } from './layout/types.js';
	import type { PaneData } from './layout/runtime.js';
	import type { DividerData } from './layout/runtime.js';
	import type { GroupData } from './layout/runtime.js';
	import type { ZoneMap } from './zones.js';
	import type { FloatingPanelSpec } from './floatingPanel.js';

	interface SplitEvent {
		edge: SplitEdge;
		clientX: number;
		clientY: number;
	}

	interface LayoutChangeEvent {
		layout: LayoutDocument;
	}

	interface PaneEvent {
		pane: PaneData;
		layout: LayoutDocument;
	}

	interface Props {
		layout?: LayoutDocument;
		zones: ZoneMap;
		zoneLabels?: Record<string, string>;
		thickness?: string;
		padding?: string;
		color?: string;
		onlayoutchange?: (event: LayoutChangeEvent) => void;
		onopen?: (event: PaneEvent) => void;
		onclose?: (event: PaneEvent) => void;
		zoneContextMenus?: Record<string, PaneContextAction[]>;
		onpanecontextmenu?: (event: PaneContextEvent) => void;
		/** Panels docked to an edge, overlaying the pane grid — independent of the divider tree. */
		floatingPanels?: FloatingPanelSpec[];
		/** Fires when the pane the mouse is over responds to `N` for one of its own panels. */
		onfloatingpaneltoggle?: (panelId: string) => void;
	}
</script>

<script lang="ts">
	import { NORTH, SOUTH, WEST, MIN_PANE_FRACTION, isModifierPressed } from './layout/constants.js';
	import { buildRuntimeTree } from './layout/build.js';
	import { serializeRuntime } from './layout/serialize.js';
	import { createPaneIdUnique } from './layout/id.js';
	import { clamp, removeFromArray } from './layout/utils.js';
	import {
		collectDividers,
		collectPanes,
		DividerData,
		GroupData,
		isPaneData,
		PaneData
	} from './layout/runtime.js';
	import Pane from './Pane.svelte';
	import Divider from './Divider.svelte';
	import PaneContextMenu from './PaneContextMenu.svelte';
	import { composePaneMenu, paneMenuSeparator } from './layout/menu.js';

	let {
		layout = $bindable(),
		zones,
		zoneLabels,
		thickness = '1px',
		padding = '6px',
		color = 'white',
		onlayoutchange,
		onopen,
		onclose,
		zoneContextMenus,
		onpanecontextmenu,
		floatingPanels = [],
		onfloatingpaneltoggle
	}: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let root = $state<GroupData | null>(null);
	let panes = $state<PaneData[]>([]);
	let dividers = $state<DividerData[]>([]);
	let usedIds = $state(new Set<string>());
	let dividerId = $state(0);
	let dragging = $state<DividerData | null>(null);
	let closing = $state(false);
	let modifierPressed = $state(false);
	let savedUserSelect = $state('');
	let layoutTick = $state(0);
	let contextMenu = $state<{
		pane: PaneData;
		x: number;
		y: number;
		items: PaneContextAction[];
	} | null>(null);
	/** JSON fingerprint of the last document applied to runtime (prevents effect loops). */
	let appliedDocJson = '';

	const hasPaneMenus = $derived(zoneContextMenus !== undefined || onpanecontextmenu !== undefined);

	const resolvedZoneLabels = $derived(zoneLabels ?? Object.fromEntries(Object.keys(zones).map((k) => [k, k])));
	const availableZones = $derived(Object.keys(zones));

	function bumpLayout() {
		layoutTick++;
	}

	function applyDocument(doc: LayoutDocument) {
		const tree = buildRuntimeTree(doc);
		root = tree.root;
		panes = tree.panes;
		dividers = tree.dividers;
		usedIds = tree.usedIds;
		dividerId = dividers.reduce((max, d) => Math.max(max, d.id), -1) + 1;
		bumpLayout();
	}

	// Sync external layout prop → runtime tree. Do not read `root` here — that created a
	// read/write loop (rebuild updates root → effect re-runs → rebuild …).
	$effect(() => {
		const doc = layout;
		if (!doc) return;

		const json = JSON.stringify(doc);
		if (json === appliedDocJson) return;

		appliedDocJson = json;
		applyDocument(doc);
	});

	function commitLayout() {
		if (!root) return;

		const next = serializeRuntime(root);
		const json = JSON.stringify(next);
		appliedDocJson = json;
		layout = next;
		onlayoutchange?.({ layout: next });
	}

	function lockUserSelect() {
		savedUserSelect = document.body.style.userSelect;
		document.body.style.userSelect = 'none';
	}

	function unlockUserSelect() {
		document.body.style.userSelect = savedUserSelect;
	}

	// Window-level drag tracking — overlay-only listeners miss mouseup when the overlay
	// mounts after mousedown (split) or when the pointer leaves the divider first.
	$effect(() => {
		if (!dragging) return;

		const onMove = (event: MouseEvent) => drag(event);
		const onUp = (event: MouseEvent) => endDrag(event);

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		return () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
	});

	function split(pane: PaneData, event: SplitEvent) {
		if (!container) return;

		const rect = container.getBoundingClientRect();
		const { edge, clientX, clientY } = event;

		const dividerType = edge === NORTH || edge === SOUTH ? 'horizontal' : 'vertical';
		const childGroupIsRow = dividerType === 'vertical';

		let group = pane.parent;
		if (!group) return;

		const newGroup =
			group.row === childGroupIsRow
				? null
				: new GroupData(childGroupIsRow, {
						pos: pane.pos,
						size: pane.size,
						prev: pane.prev,
						next: pane.next
					});

		if (newGroup) {
			pane.pos = 0;
			pane.size = 1;

			group.replaceChild(pane, newGroup);
			group = newGroup;

			if (pane.next) pane.next.prev = newGroup;
			if (pane.prev) pane.prev.next = newGroup;

			pane.next = pane.prev = null;
		}

		const bounds = group.bounds(rect);
		const newPane = PaneData.fromPane(createPaneIdUnique(usedIds), pane);
		group.addChild(newPane);

		const divider = new DividerData({
			id: dividerId++,
			type: dividerType,
			group,
			position: null,
			prev: null,
			next: null
		});

		const pos = childGroupIsRow
			? (clientX - bounds.left) / bounds.width
			: (clientY - bounds.top) / bounds.height;

		const minPos = pane.pos + MIN_PANE_FRACTION;
		const maxPos = pane.pos + pane.size - MIN_PANE_FRACTION;
		const clampedPos = clamp(pos, minPos, maxPos);
		const d = clampedPos - pane.pos;
		divider.position = clampedPos;

		if (edge === NORTH || edge === WEST) {
			newPane.size = d;
			pane.pos = clampedPos;
			pane.size -= d;

			if (pane.prev) pane.prev.next = newPane;

			pane.prev = divider;
			newPane.next = divider;

			divider.prev = newPane;
			divider.next = pane;
		} else {
			newPane.pos = clampedPos;
			newPane.size = pane.size - d;
			pane.size = d;

			if (pane.next) pane.next.prev = newPane;

			pane.next = divider;
			newPane.prev = divider;

			divider.prev = pane;
			divider.next = newPane;
		}

		if (root) {
			panes = collectPanes(root);
			dividers = collectDividers(root);
		}
		dragging = divider;
		bumpLayout();
		lockUserSelect();

		const nextLayout = serializeRuntime(root);
		appliedDocJson = JSON.stringify(nextLayout);
		layout = nextLayout;
		onlayoutchange?.({ layout: nextLayout });
		onopen?.({ pane: newPane, layout: nextLayout });
	}

	function startDrag(divider: DividerData, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		lockUserSelect();
		dragging = divider;
		drag(event);
	}

	function drag(event: MouseEvent) {
		if (!dragging || !container) return;

		const bounds = dragging.parent.bounds(container.getBoundingClientRect());
		const prev = dragging.prev;
		const next = dragging.next;
		if (!prev || !next) return;

		const min = prev.pos;
		const max = next.pos + next.size;

		const position =
			dragging.type === 'vertical'
				? clamp((event.clientX - bounds.left) / bounds.width, min, max)
				: clamp((event.clientY - bounds.top) / bounds.height, min, max);

		prev.setRange(min, position);
		next.setRange(position, max);
		dragging.position = position;
		closing = position === min || position === max;

		bumpLayout();
	}

	function endDrag(event: MouseEvent) {
		if (!dragging) return;

		drag(event);

		const active = dragging;
		const prevSize = active.prev?.size ?? 0;
		const min = Math.min(prevSize, active.next?.size ?? 0);
		let closedPane: PaneData | undefined;

		if (min <= 0 && active.prev && active.next) {
			removeFromArray(active.parent.dividers, active);
			removeFromArray(dividers, active);

			const victim = prevSize <= 0 ? active.prev : active.next;

			if (prevSize <= 0) {
				const mergedDivider = active.prev.prev;
				active.next.prev = mergedDivider;
				if (mergedDivider && 'next' in mergedDivider) {
					mergedDivider.next = active.next;
				}
			} else {
				const mergedDivider = active.next.next;
				active.prev.next = mergedDivider;
				if (mergedDivider && 'prev' in mergedDivider) {
					mergedDivider.prev = active.prev;
				}
			}

			if (isPaneData(victim)) {
				victim.destroy(panes, dividers);
				usedIds.delete(victim.id);
				if (victim.parent) {
					removeFromArray(victim.parent.children, victim);
				}
				closedPane = victim;
			} else {
				victim.destroy(panes, dividers);
			}
		}

		if (root) {
			panes = collectPanes(root);
			dividers = collectDividers(root);
		}

		dragging = null;
		closing = false;
		unlockUserSelect();
		commitLayout();
		bumpLayout();

		if (closedPane) {
			onclose?.({ pane: closedPane, layout: layout! });
		}
	}

	function handleZoneChange(pane: PaneData, zone: string) {
		pane.zone = zone;
		bumpLayout();
		panes = [...panes];
		commitLayout();
	}

	function handleKeydown(event: KeyboardEvent) {
		modifierPressed = isModifierPressed(event);
	}

	function handleKeyup(event: KeyboardEvent) {
		if (!isModifierPressed(event)) modifierPressed = false;
	}

	function closeContextMenu() {
		contextMenu = null;
	}

	function paneCenterClient(pane: PaneData): { clientX: number; clientY: number } {
		if (!container) return { clientX: 0, clientY: 0 };
		const bounds = pane.bounds(container.getBoundingClientRect());
		return {
			clientX: bounds.left + bounds.width / 2,
			clientY: bounds.top + bounds.height / 2
		};
	}

	function buildBuiltinActions(pane: PaneData): PaneContextAction[] {
		const center = paneCenterClient(pane);
		const zoneChangeActions = availableZones.map((zoneKey) => ({
			id: `pane-zone-${zoneKey}`,
			label: resolvedZoneLabels[zoneKey] ?? zoneKey,
			disabled: zoneKey === pane.zone,
			run: () => handleZoneChange(pane, zoneKey)
		}));

		return [
			{
				id: 'split-north',
				label: 'Split north',
				run: () => split(pane, { edge: NORTH, ...center })
			},
			{
				id: 'split-south',
				label: 'Split south',
				run: () => split(pane, { edge: SOUTH, ...center })
			},
			{
				id: 'split-east',
				label: 'Split east',
				run: () => split(pane, { edge: EAST, ...center })
			},
			{
				id: 'split-west',
				label: 'Split west',
				run: () => split(pane, { edge: WEST, ...center })
			},
			paneMenuSeparator(),
			...zoneChangeActions,
			paneMenuSeparator(),
			{
				id: 'close-pane',
				label: 'Close pane',
				run: () => closePane(pane)
			}
		];
	}

	function mergeDivider(divider: DividerData) {
		const prev = divider.prev;
		const next = divider.next;
		if (!prev || !next) return;

		const prevSize = isPaneData(prev) ? prev.size : 0;
		const victim = prevSize <= 0 ? prev : next;

		removeFromArray(divider.parent.dividers, divider);
		removeFromArray(dividers, divider);

		if (prevSize <= 0) {
			const mergedDivider = prev.prev;
			next.prev = mergedDivider;
			if (mergedDivider && 'next' in mergedDivider) {
				mergedDivider.next = next;
			}
		} else {
			const mergedDivider = next.next;
			prev.next = mergedDivider;
			if (mergedDivider && 'prev' in mergedDivider) {
				mergedDivider.prev = prev;
			}
		}

		if (isPaneData(victim)) {
			victim.destroy(panes, dividers);
			usedIds.delete(victim.id);
			if (victim.parent) {
				removeFromArray(victim.parent.children, victim);
			}
			onclose?.({ pane: victim, layout: layout! });
		} else {
			victim.destroy(panes, dividers);
		}

		if (root) {
			panes = collectPanes(root);
			dividers = collectDividers(root);
		}
		commitLayout();
		bumpLayout();
	}

	function closePane(pane: PaneData) {
		if (pane.next instanceof DividerData) {
			const divider = pane.next;
			const next = divider.next;
			if (!next || !isPaneData(next)) return;
			divider.position = pane.pos;
			pane.setRange(pane.pos, pane.pos);
			next.setRange(pane.pos, next.pos + next.size);
			mergeDivider(divider);
			return;
		}

		if (pane.prev instanceof DividerData) {
			const divider = pane.prev;
			const prev = divider.prev;
			if (!prev || !isPaneData(prev)) return;
			const collapsePos = pane.pos + pane.size;
			divider.position = collapsePos;
			pane.setRange(collapsePos, collapsePos);
			prev.setRange(prev.pos, collapsePos);
			mergeDivider(divider);
		}
	}

	function handlePaneContextMenu(pane: PaneData, event: { clientX: number; clientY: number }) {
		if (onpanecontextmenu) {
			onpanecontextmenu({
				paneId: pane.id,
				zone: pane.zone,
				clientX: event.clientX,
				clientY: event.clientY
			});
			return;
		}

		if (!zoneContextMenus) return;

		contextMenu = {
			pane,
			x: event.clientX,
			y: event.clientY,
			items: composePaneMenu(pane.zone, zoneContextMenus, buildBuiltinActions(pane))
		};
	}
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

<div class="clip">
	<div
		bind:this={container}
		class="layout"
		style="--thickness: {thickness}; --draggable: calc({thickness} + {padding}); --color: {color}; --subdivide-menu-color: #4a6fa5; --subdivide-menu-bg: #2a3142"
	>
		{#each panes as pane (pane.id)}
			<Pane
				{pane}
				{layoutTick}
				{modifierPressed}
				{zones}
				zoneLabels={resolvedZoneLabels}
				{availableZones}
				{floatingPanels}
				{onfloatingpaneltoggle}
				onsplit={(event) => split(pane, event)}
				onzonechange={(zone) => handleZoneChange(pane, zone)}
				oncontextmenu={hasPaneMenus
					? (event) => handlePaneContextMenu(pane, event)
					: undefined}
			/>
		{/each}

		{#each dividers as divider (divider.id)}
			<Divider {divider} {layoutTick} onmousedown={(event) => startDrag(divider, event)} />
		{/each}

		{#if dragging}
			<div
				class="overlay {dragging.type} {closing ? 'closing' : ''}"
				role="presentation"
				aria-hidden="true"
			></div>
		{/if}

		{#if contextMenu}
			<PaneContextMenu
				x={contextMenu.x}
				y={contextMenu.y}
				items={contextMenu.items}
				paneId={contextMenu.pane.id}
				zone={contextMenu.pane.zone}
				onclose={closeContextMenu}
			/>
		{/if}
	</div>
</div>

<style>
	.clip,
	.overlay {
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	.clip {
		position: absolute;
		overflow: hidden;
	}

	/* Cursor hint only — pointer events handled on window while dragging. */
	.overlay {
		position: fixed;
		z-index: 2147483647;
		pointer-events: none;
	}

	.overlay.vertical {
		cursor: col-resize;
	}

	.overlay.horizontal {
		cursor: row-resize;
	}

	.overlay.closing {
		cursor:
			url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAABYUlEQVR4AWP4//8/Bj548CCTvr7+BBYWlm+MjIz/QJiDg+NVQkJCDEgeG8YqGBcXF8XExPRXTU2tCWhICtCQFGVl5ZVAg3/W19fLYtODrFnby8vLGYSlpKRWc3JyPvH19XV2dXV1dnNzA+FIkMtMTEyqYOpaW1slMQxiZ2d/DVJICpaWll6JYpCwsPAToMRfUg1iY2P7Jioq+ghukIiISImkpORMkCTQW01Ag0tBWEZGpkxFRaUKGFZVYmJipTBxHh6eZSC16urqZUDxYozABkl6eHhI8vPzS/Lx8amBxOTl5dWcnZ0lq6qqWIBiekA+L9DiaJBamD6sBtnb20sC6U4gvgASAxp63tbWtgeZTcigUYNGDYqJiZGeO3cu4/z58xlBYosWLWKcMmUKmA0TU1BQiMVrECjvADPiQSMjo4X4MDCF3wQadganQZGRkVFAw96DyiJ8mJeX93Zvb68Osl4AWF08Tf9FROcAAAAASUVORK5CYII=')
				9 9,
			auto;
	}

	.layout {
		position: absolute;
		width: calc(100% + var(--thickness));
		height: calc(100% + var(--thickness));
		overflow: hidden;
		margin: calc(0px - var(--thickness) / 2);
	}
</style>
