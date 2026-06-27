import { describe, expect, it } from 'vitest';
import { frustumFromViewProjection } from './camera.js';
import { cullSpheres } from './frustumCull.js';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('frustum cull', () => {
	it('keeps in-frustum spheres and drops far-outside ones', () => {
		const f = frustumFromViewProjection(IDENTITY);
		const items = [
			{ id: 'in', bounds: { center: [0, 0, 0.5] as const, radius: 0.1 } },
			{ id: 'out', bounds: { center: [50, 0, 0.5] as const, radius: 0.1 } }
		];
		const kept = cullSpheres(f, items).map((i) => i.id);
		expect(kept).toContain('in');
		expect(kept).not.toContain('out');
	});

	it('keeps a large sphere straddling a plane', () => {
		const f = frustumFromViewProjection(IDENTITY);
		const kept = cullSpheres(f, [{ id: 'big', bounds: { center: [2, 0, 0.5] as const, radius: 5 } }]);
		expect(kept.map((i) => i.id)).toEqual(['big']); // radius 5 reaches inside
	});
});
