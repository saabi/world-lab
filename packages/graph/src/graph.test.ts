import { describe, expect, it } from 'vitest';
import type { CoordinateSpace, DataType, GraphDocument } from './types.js';
import { validateGraph } from './validate.js';
import { deserializeGraph, serializeGraph } from './serialize.js';

function twoNodeGraph(opts?: {
	toType?: DataType;
	fromSpace?: CoordinateSpace;
	toSpace?: CoordinateSpace;
}): GraphDocument {
	return {
		version: '1',
		nodes: [
			{
				id: 'n_noise',
				primitive: 'noise.perlin3d',
				inputs: [{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f', space: 'body_dir' }],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32', space: opts?.fromSpace ?? 'none' }],
			},
			{
				id: 'n_remap',
				primitive: 'math.remap',
				inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: opts?.toType ?? 'f32', space: opts?.toSpace ?? 'none' }],
				outputs: [{ id: 'out', name: 'out', direction: 'out', dataType: 'f32' }],
			},
		],
		edges: [{ id: 'e1', from: { node: 'n_noise', port: 'value' }, to: { node: 'n_remap', port: 'x' } }],
		outputs: [{ name: 'height', from: { node: 'n_remap', port: 'out' } }],
		consumers: [{ type: 'terrain-mesh', outputs: ['height'] }],
	};
}

describe('@virtual-planet/graph IR', () => {
	it('round-trips through serialize/deserialize', () => {
		const doc = twoNodeGraph();
		expect(deserializeGraph(serializeGraph(doc))).toEqual(doc);
	});

	it('serialization is deterministic', () => {
		expect(serializeGraph(twoNodeGraph())).toBe(serializeGraph(twoNodeGraph()));
	});

	it('accepts a type- and space-matching edge', () => {
		expect(validateGraph(twoNodeGraph()).ok).toBe(true);
	});

	it('rejects a type-mismatched edge', () => {
		const res = validateGraph(twoNodeGraph({ toType: 'vec3f' }));
		expect(res.ok).toBe(false);
		expect(res.issues.some((i) => i.kind === 'type-mismatch')).toBe(true);
	});

	it('rejects a coordinate-space-mismatched edge', () => {
		const res = validateGraph(twoNodeGraph({ fromSpace: 'world_dir', toSpace: 'body_dir' }));
		expect(res.ok).toBe(false);
		expect(res.issues.some((i) => i.kind === 'space-mismatch')).toBe(true);
	});
});
