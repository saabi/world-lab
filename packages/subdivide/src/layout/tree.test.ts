import { describe, expect, it } from 'vitest';
import { MIN_PANE_FRACTION } from './constants.js';
import { buildRuntimeTree } from './build.js';
import { defaultSceneEditorLayout } from './defaultLayout.js';
import { parseLayoutDocument } from './parse.js';
import { collectDividers, collectPanes, GroupData, isPaneData, PaneData } from './runtime.js';
import { serializeRuntime } from './serialize.js';
import { clamp } from './utils.js';
import type { LayoutDocument } from './types.js';

const CONTAINER = { left: 0, top: 0, right: 1000, bottom: 800 };

function roundTrip(doc: LayoutDocument): LayoutDocument {
	const { root } = buildRuntimeTree(doc);
	return serializeRuntime(root);
}

describe('bounds', () => {
	it('maps the viewport within the main row above the flight deck', () => {
		const doc = defaultSceneEditorLayout();
		const { panes } = buildRuntimeTree(doc);
		const viewport = panes.find((pane) => pane.zone === 'viewport');
		expect(viewport).toBeDefined();

		const bounds = viewport!.bounds(CONTAINER);
		expect(bounds.left).toBeCloseTo(220);
		expect(bounds.top).toBeCloseTo(0);
		expect(bounds.width).toBeCloseTo(780);
		expect(bounds.height).toBeCloseTo(624);
	});

	it('computes nested group bounds for the left stack', () => {
		const doc = defaultSceneEditorLayout();
		const { panes } = buildRuntimeTree(doc);
		const outliner = panes.find((pane) => pane.zone === 'outliner');
		expect(outliner).toBeDefined();

		const bounds = outliner!.bounds(CONTAINER);
		expect(bounds.left).toBeCloseTo(0);
		expect(bounds.top).toBeCloseTo(0);
		expect(bounds.width).toBeCloseTo(220);
		expect(bounds.height).toBeCloseTo(280.8);
	});

	it('maps the flight pane across the bottom of the container', () => {
		const doc = defaultSceneEditorLayout();
		const { panes } = buildRuntimeTree(doc);
		const flight = panes.find((pane) => pane.zone === 'flight');
		expect(flight).toBeDefined();

		const bounds = flight!.bounds(CONTAINER);
		expect(bounds.left).toBeCloseTo(0);
		expect(bounds.top).toBeCloseTo(624);
		expect(bounds.width).toBeCloseTo(1000);
		expect(bounds.height).toBeCloseTo(176);
	});
});

describe('serialize round-trip', () => {
	it('preserves layout structure and zones', () => {
		const doc = defaultSceneEditorLayout();
		const serialized = roundTrip(doc);

		expect(serialized.root.type).toBe('group');
		expect(serialized.root.row).toBe(false);
		expect(serialized.root.children).toHaveLength(2);

		const main = serialized.root.children[0];
		expect(main.type).toBe('group');
		if (main.type !== 'group') throw new Error('expected group');
		expect(main.row).toBe(true);

		const left = main.children[0];
		expect(left.type).toBe('group');
		if (left.type !== 'group') throw new Error('expected group');
		const zones = left.children.map((child) => (child.type === 'pane' ? child.zone : null));
		expect(zones).toEqual(['outliner', 'properties', 'renderSettings']);

		const viewport = main.children[1];
		expect(viewport.type).toBe('pane');
		if (viewport.type !== 'pane') throw new Error('expected pane');
		expect(viewport.zone).toBe('viewport');

		const flight = serialized.root.children[1];
		expect(flight.type).toBe('pane');
		if (flight.type !== 'pane') throw new Error('expected pane');
		expect(flight.zone).toBe('flight');
	});

	it('round-trips nested groups with stable fractional positions', () => {
		const doc: LayoutDocument = {
			root: {
				type: 'group',
				row: true,
				pos: 0,
				size: 1,
				children: [
					{
						type: 'group',
						row: false,
						pos: 0,
						size: 0.5,
						children: [
							{ type: 'pane', id: 'a', zone: 'top', pos: 0, size: 0.5 },
							{ type: 'pane', id: 'b', zone: 'bottom', pos: 0.5, size: 0.5 }
						]
					},
					{ type: 'pane', id: 'c', zone: 'right', pos: 0.5, size: 0.5 }
				]
			}
		};

		const serialized = roundTrip(doc);
		const left = serialized.root.children[0];
		expect(left.type).toBe('group');
		if (left.type !== 'group') throw new Error('expected group');
		expect(left.children[0]).toMatchObject({ zone: 'top', pos: 0, size: 0.5 });
		expect(left.children[1]).toMatchObject({ zone: 'bottom', pos: 0.5, size: 0.5 });
	});
});

describe('parseLayoutDocument', () => {
	it('coerces legacy childProps to zone', () => {
		const parsed = parseLayoutDocument({
			root: {
				type: 'group',
				row: false,
				pos: 0,
				size: 1,
				children: [
					{
						type: 'pane',
						id: 'pane-1',
						pos: 0,
						size: 1,
						childProps: 'legacy-zone'
					}
				]
			}
		});

		const pane = parsed.root.children[0];
		expect(pane.type).toBe('pane');
		if (pane.type !== 'pane') throw new Error('expected pane');
		expect(pane.zone).toBe('legacy-zone');
	});
});

describe('setRange resize', () => {
	it('updates pane fractional range', () => {
		const prev = new PaneData('prev', {
			pos: 0,
			size: 0.4,
			prev: null,
			next: null,
			zone: 'left'
		});
		const next = new PaneData('next', {
			pos: 0.4,
			size: 0.6,
			prev: null,
			next: null,
			zone: 'right'
		});

		prev.setRange(0, 0.55);
		next.setRange(0.55, 1);

		expect(prev.pos).toBeCloseTo(0);
		expect(prev.size).toBeCloseTo(0.55);
		expect(next.pos).toBeCloseTo(0.55);
		expect(next.size).toBeCloseTo(0.45);
	});

	it('reflects resized bounds inside a built group', () => {
		const group = new GroupData(true, { pos: 0, size: 1, prev: null, next: null });
		const left = new PaneData('left', {
			pos: 0,
			size: 0.3,
			prev: null,
			next: null,
			zone: 'left'
		});
		const right = new PaneData('right', {
			pos: 0.3,
			size: 0.7,
			prev: null,
			next: null,
			zone: 'right'
		});

		group.addChild(left);
		group.addChild(right);

		left.setRange(0, 0.5);
		right.setRange(0.5, 1);

		expect(left.bounds(CONTAINER).width).toBeCloseTo(500);
		expect(right.bounds(CONTAINER).width).toBeCloseTo(500);
	});
});

describe('collectPanes', () => {
	it('returns all panes in nested layout', () => {
		const { root } = buildRuntimeTree(defaultSceneEditorLayout());
		const collected = collectPanes(root);
		expect(collected).toHaveLength(5);
		expect(collected.map((p) => p.zone).sort()).toEqual(
			['flight', 'outliner', 'properties', 'renderSettings', 'viewport'].sort()
		);
	});
});

describe('collectDividers', () => {
	it('matches dividers built from default scene layout', () => {
		const { root, dividers } = buildRuntimeTree(defaultSceneEditorLayout());
		expect(collectDividers(root)).toHaveLength(dividers.length);
	});
});

describe('isPaneData', () => {
	it('distinguishes panes from groups', () => {
		const pane = new PaneData('p', { pos: 0, size: 1, prev: null, next: null, zone: 'a' });
		const group = new GroupData(false, { pos: 0, size: 1, prev: null, next: null });
		expect(isPaneData(pane)).toBe(true);
		expect(isPaneData(group)).toBe(false);
	});
});

describe('PaneData.destroy', () => {
	it('no-ops when pane is absent from array', () => {
		const pane = new PaneData('orphan', {
			pos: 0,
			size: 1,
			prev: null,
			next: null,
			zone: 'a'
		});
		const panes: PaneData[] = [];
		expect(() => pane.destroy(panes, [])).not.toThrow();
		expect(panes).toHaveLength(0);
	});
});

describe('split position clamp', () => {
	it('enforces minimum pane fraction for edge splits', () => {
		const panePos = 0;
		const paneSize = 1;
		const rawPos = 0.01;
		const minPos = panePos + MIN_PANE_FRACTION;
		const maxPos = panePos + paneSize - MIN_PANE_FRACTION;
		const clampedPos = clamp(rawPos, minPos, maxPos);
		expect(clampedPos).toBeCloseTo(MIN_PANE_FRACTION);
		expect(clampedPos - panePos).toBeGreaterThanOrEqual(MIN_PANE_FRACTION);
		expect(paneSize - (clampedPos - panePos)).toBeGreaterThanOrEqual(MIN_PANE_FRACTION);
	});
});
