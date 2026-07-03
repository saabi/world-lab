import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '@world-lab/graph';
import { sliceGraph } from './slice.js';

// n_src feeds both n_h (height) and n_m (mask); n_iso is independent (noise).
function graph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			{ id: 'n_src', primitive: 'noise.perlin3d',
			  inputs: [{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f' }],
			  outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }] },
			{ id: 'n_h', primitive: 'math.remap',
			  inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
			  outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }] },
			{ id: 'n_m', primitive: 'math.clamp',
			  inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
			  outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }] },
			{ id: 'n_iso', primitive: 'noise.perlin3d',
			  inputs: [{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f' }],
			  outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }] },
		],
		edges: [
			{ id: 'e_h', from: { node: 'n_src', port: 'value' }, to: { node: 'n_h', port: 'x' } },
			{ id: 'e_m', from: { node: 'n_src', port: 'value' }, to: { node: 'n_m', port: 'x' } },
		],
		outputs: [
			{ name: 'height', from: { node: 'n_h', port: 'value' } },
			{ name: 'mask', from: { node: 'n_m', port: 'value' } },
			{ name: 'noise', from: { node: 'n_iso', port: 'value' } },
		],
	};
}

describe('@world-lab/compiler sliceGraph', () => {
	it('keeps only the requested branch and excludes unrelated nodes', () => {
		const s = sliceGraph(graph(), { outputs: ['height'] });
		expect(s.nodes.map((n) => n.id).sort()).toEqual(['n_h', 'n_src']);
		expect(s.edges.map((e) => e.id)).toEqual(['e_h']);
	});

	it('keeps a shared node once across multiple outputs', () => {
		const s = sliceGraph(graph(), { outputs: ['height', 'mask'] });
		expect(s.nodes.map((n) => n.id).sort()).toEqual(['n_h', 'n_m', 'n_src']);
		expect(s.nodes.filter((n) => n.id === 'n_src')).toHaveLength(1);
	});

	it('slices an independent output to just its node', () => {
		const s = sliceGraph(graph(), { outputs: ['noise'] });
		expect(s.nodes.map((n) => n.id)).toEqual(['n_iso']);
		expect(s.edges).toEqual([]);
	});

	it('throws on an unknown output name', () => {
		expect(() => sliceGraph(graph(), { outputs: ['nope'] })).toThrow();
	});
});
