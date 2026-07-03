import { describe, expect, it } from 'vitest';

import { GEOMETRY_PLANE_SOURCE } from './planeGrid.js';
import { STAGE_VERTEX_SOURCE } from './vertexStage.js';
import {
	BUFFER_PERSIST_SOURCE,
	STAGE_FRAGMENT_SOURCE,
	TARGET_DISPLAY_SOURCE,
	TARGET_MESH_SOURCE
} from './structural.js';

describe('procedural-wgsl pipeline modules', () => {
	it('geometry.plane defines real plane_grid_position math with scale and Euler rotation', () => {
		expect(GEOMETRY_PLANE_SOURCE).toContain('fn plane_grid_position(');
		expect(GEOMETRY_PLANE_SOURCE).toContain('fn plane_grid_euler_rotate(');
		expect(GEOMETRY_PLANE_SOURCE).toContain('fn planeGrid(');
		expect(GEOMETRY_PLANE_SOURCE).not.toMatch(/fn\s+planeGrid\([^)]*\)\s*\{\s*\}/);
	});

	it('stage.vertex calls plane_grid_position for clip output', () => {
		expect(STAGE_VERTEX_SOURCE).toContain('plane_grid_position(');
		expect(STAGE_VERTEX_SOURCE).toContain('fn vertexStage(');
		expect(STAGE_VERTEX_SOURCE).not.toMatch(/fn\s+vertexStage\([^)]*\)\s*\{\s*\}/);
	});

	it('structural pipeline nodes have no empty function bodies', () => {
		for (const source of [
			BUFFER_PERSIST_SOURCE,
			STAGE_FRAGMENT_SOURCE,
			TARGET_DISPLAY_SOURCE,
			TARGET_MESH_SOURCE
		]) {
			expect(source).toContain('(no WGSL — structural node)');
			expect(source).not.toMatch(/fn\s+\w+\([^)]*\)\s*\{\s*\}/);
		}
	});
});
