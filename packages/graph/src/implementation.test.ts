import { describe, expect, it } from 'vitest';

import { getPrimitive, listPrimitives } from './registry.js';
import './primitives/index.js';

describe('primitive implementations', () => {
	it('normalizes every registered primitive to a canonical implementation', () => {
		for (const primitive of listPrimitives()) {
			expect(primitive.implementation, primitive.id).toBeDefined();
		}
	});

	it('classifies structural, sink, host, group, and callable primitives honestly', () => {
		for (const id of ['buffer.persist', 'stage.fragment', 'geometry.fullscreenPlane']) {
			expect(getPrimitive(id)?.implementation).toEqual({
				kind: 'legacy-structural',
				marker: id
			});
			expect(getPrimitive(id)?.wgsl).toBeUndefined();
		}

		expect(getPrimitive('target.display')?.implementation.kind).toBe('sink');
		expect(getPrimitive('target.mesh')?.implementation.kind).toBe('sink');
		expect(getPrimitive('stage.vertex')?.implementation).toEqual({
			kind: 'wgsl-function',
			moduleId: 'stage.vertex',
			entry: 'vertexStage'
		});

		expect(getPrimitive('procedural.uv')?.implementation).toEqual({
			kind: 'host-input',
			binding: { context: 'invocation', key: 'uv' }
		});
		expect(getPrimitive('host.fragCoord')?.implementation).toEqual({
			kind: 'host-input',
			binding: {
				context: 'stage-builtin',
				key: 'fragCoord',
				stages: ['fragment']
			}
		});

		for (const id of [
			'math.remap',
			'sdf.opSubtract',
			'transform.normalDisplace',
			'transform.scale',
			'transform.spherify',
			'transform.translate'
		]) {
			expect(getPrimitive(id)?.implementation).toEqual({ kind: 'group', groupId: id });
			expect(getPrimitive(id)?.wgsl?.moduleId).toBe(id);
		}
	});
});
