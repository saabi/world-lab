import { describe, expect, it } from 'vitest';
import { getPrimitive, type GraphDocument } from '@virtual-planet/graph';
import { evaluateGraphOutput } from './evalGraph.js';

function uvPerlinRemapGraph(): GraphDocument {
	return {
		version: '1',
		nodes: [
			{
				id: 'n_uv',
				primitive: 'procedural.uv',
				inputs: [],
				outputs: [{ id: 'uv', name: 'uv', direction: 'out', dataType: 'vec2f', space: 'none' }]
			},
			{
				id: 'n_perlin',
				primitive: 'noise.perlin3d',
				inputs: [
					{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f', space: 'none' }
				],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32', space: 'none' }]
			},
			{
				id: 'n_remap',
				primitive: 'math.remap',
				params: { inMin: -1, inMax: 1, outMin: 0, outMax: 1 },
				inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32', space: 'none' }],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32', space: 'none' }]
			}
		],
		edges: [
			{ id: 'e_uv_perlin', from: { node: 'n_uv', port: 'uv' }, to: { node: 'n_perlin', port: 'position' } },
			{ id: 'e_perlin_remap', from: { node: 'n_perlin', port: 'value' }, to: { node: 'n_remap', port: 'x' } }
		],
		outputs: [{ name: 'height', from: { node: 'n_remap', port: 'value' } }],
		consumers: [{ type: 'preview', outputs: ['height'] }]
	};
}

function handComputedRemap(uv: [number, number], remapParams: Record<string, number>): number {
	const perlin = getPrimitive('noise.perlin3d')!.evalCPU!({
		inputs: { position: [uv[0], uv[1], 0] },
		params: {}
	}).value as number;
	const remap = getPrimitive('math.remap')!.evalCPU!({
		inputs: { x: perlin },
		params: remapParams
	}).value as number;
	return remap;
}

describe('@virtual-planet/runtime-cpu evalGraph', () => {
	it('evaluates procedural.uv -> noise.perlin3d -> math.remap with known params', () => {
		const doc = uvPerlinRemapGraph();
		const uv: [number, number] = [0.5, 0.5];
		const remapParams = { inMin: -1, inMax: 1, outMin: 0, outMax: 1 };

		const result = evaluateGraphOutput(
			doc,
			{ node: 'n_remap', port: 'value' },
			{ procedural: { uv } }
		);

		expect(result).toBeCloseTo(handComputedRemap(uv, remapParams));
	});

	it('throws on cycles', () => {
		const doc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_a',
					primitive: 'math.clamp',
					inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_b',
					primitive: 'math.remap',
					inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [
				{ id: 'e_ab', from: { node: 'n_a', port: 'value' }, to: { node: 'n_b', port: 'x' } },
				{ id: 'e_ba', from: { node: 'n_b', port: 'value' }, to: { node: 'n_a', port: 'x' } }
			],
			outputs: [{ name: 'out', from: { node: 'n_b', port: 'value' } }],
			consumers: []
		};

		expect(() =>
			evaluateGraphOutput(doc, { node: 'n_b', port: 'value' }, { procedural: {} })
		).toThrow(/cycle/i);
	});

	it('throws on invalid type-mismatched edges', () => {
		const doc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_uv',
					primitive: 'procedural.uv',
					inputs: [],
					outputs: [{ id: 'uv', name: 'uv', direction: 'out', dataType: 'vec2f' }]
				},
				{
					id: 'n_remap',
					primitive: 'math.remap',
					inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [
				{ id: 'e_bad', from: { node: 'n_uv', port: 'uv' }, to: { node: 'n_remap', port: 'x' } }
			],
			outputs: [{ name: 'out', from: { node: 'n_remap', port: 'value' } }],
			consumers: []
		};

		expect(() =>
			evaluateGraphOutput(doc, { node: 'n_remap', port: 'value' }, { procedural: { uv: [0.5, 0.5] } })
		).toThrow(/type mismatch/i);
	});
});
