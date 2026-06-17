import { describe, expect, it } from 'vitest';
import { applyVertexBudget, DEFAULT_MAX_VERTICES_PER_FRAME } from './vertexBudget.js';
import type { ScheduledPatch } from './cubeSphereScheduler.js';

function patch(id: number, resolution: number, priority: number): ScheduledPatch {
	return {
		kind: 'cubeSphere',
		id,
		face: 0,
		uvMin: [0, 0],
		uvMax: [0.5, 0.5],
		resolution,
		morph: 0,
		priority
	};
}

describe('applyVertexBudget', () => {
	it('keeps all patches when under budget', () => {
		const patches = [patch(0, 8, 1), patch(1, 8, 2)];
		const result = applyVertexBudget(patches, DEFAULT_MAX_VERTICES_PER_FRAME);
		expect(result.patches).toHaveLength(2);
		expect(result.dropped).toBe(0);
	});

	it('drops lowest-priority patches when coarsening cannot fit budget', () => {
		const patches = [
			patch(0, 8, 100),
			patch(1, 8, 1),
			patch(2, 8, 50)
		];
		const vertsEach = 8 * 8 * 6;
		const budget = vertsEach * 2;
		const result = applyVertexBudget(patches, budget);
		expect(result.patches.length).toBeLessThanOrEqual(2);
		expect(result.dropped).toBeGreaterThan(0);
	});
});
