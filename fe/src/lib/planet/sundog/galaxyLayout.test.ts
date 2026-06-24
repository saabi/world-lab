import { describe, expect, it } from 'vitest';
import { galaxyLayout, realLayout, shuffledLayout } from './galaxyLayout.js';
import { createGalaxyScene, starNodeId, systemIdFromNode } from './galaxyScene.js';
import { listSystems } from './catalog.js';
import { listBodies } from '../scene/sceneTree.js';

const systems = () => listSystems();

describe('realLayout', () => {
	it('places one position per system, centered on the centroid', () => {
		const layout = realLayout(systems());
		expect(layout.size).toBe(systems().length);
		let sx = 0;
		let sy = 0;
		let sz = 0;
		for (const [, p] of layout) {
			sx += p[0];
			sy += p[1];
			sz += p[2];
		}
		expect(Math.abs(sx)).toBeLessThan(1);
		expect(Math.abs(sy)).toBeLessThan(1);
		expect(Math.abs(sz)).toBeLessThan(1);
	});

	it('is deterministic and gives distinct positions', () => {
		const a = realLayout(systems());
		const b = realLayout(systems());
		for (const s of systems()) expect(a.get(s.id)).toEqual(b.get(s.id));
		const keys = [...a.values()].map((p) => p.join(','));
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe('shuffledLayout', () => {
	it('is deterministic for a given seed and differs across seeds', () => {
		const a = shuffledLayout(systems(), 42);
		const b = shuffledLayout(systems(), 42);
		const c = shuffledLayout(systems(), 7);
		for (const s of systems()) expect(a.get(s.id)).toEqual(b.get(s.id));
		const differs = systems().some((s) => a.get(s.id)!.join() !== c.get(s.id)!.join());
		expect(differs).toBe(true);
	});

	it('keeps every system within the disc bounds', () => {
		const layout = shuffledLayout(systems(), 99);
		for (const [, p] of layout) {
			const r = Math.hypot(p[0], p[2]);
			expect(r).toBeLessThanOrEqual(7.5e10 + 1);
			expect(Math.abs(p[1])).toBeLessThanOrEqual(1.2e10 + 1);
		}
	});

	it('galaxyLayout dispatches by mode', () => {
		expect(galaxyLayout(systems(), 'real')).toEqual(realLayout(systems()));
		expect(galaxyLayout(systems(), 'shuffle', 5)).toEqual(shuffledLayout(systems(), 5));
	});
});

describe('createGalaxyScene', () => {
	it('builds one star body per system at its layout position', () => {
		const layout = realLayout(systems());
		const scene = createGalaxyScene(systems(), layout);
		const bodies = listBodies(scene);
		expect(bodies).toHaveLength(systems().length);
		expect(bodies.every((b) => b.bodyType === 'star')).toBe(true);
		const jondd = scene.nodes.get(starNodeId('jondd'));
		expect(jondd?.transform.position).toEqual(layout.get('jondd'));
	});

	it('round-trips star node id ↔ system id', () => {
		expect(systemIdFromNode(starNodeId('enliah'))).toBe('enliah');
		expect(systemIdFromNode('not-a-star')).toBeNull();
		expect(systemIdFromNode(null)).toBeNull();
	});
});
