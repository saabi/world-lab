import { describe, expect, it } from 'vitest';
import { getPrimitive, paramInputPorts, type GraphDocument } from '@world-lab/graph';
import { evaluateGraphOutput } from './evalGraph.js';

function uvPerlinRemapGraph(): GraphDocument {
	return {
		version: '2',
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

describe('@world-lab/runtime-cpu evalGraph', () => {
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
			version: '2',
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
		};

		expect(() =>
			evaluateGraphOutput(doc, { node: 'n_b', port: 'value' }, { procedural: {} })
		).toThrow(/cycle/i);
	});

	it('throws on invalid type-mismatched edges', () => {
		const doc: GraphDocument = {
			version: '2',
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
		};

		expect(() =>
			evaluateGraphOutput(doc, { node: 'n_remap', port: 'value' }, { procedural: { uv: [0.5, 0.5] } })
		).toThrow(/type mismatch/i);
	});

	it('uses port defaults for unconnected vector.vec4f component inputs', () => {
		const vec4 = getPrimitive('vector.vec4f')!;
		const extractW = getPrimitive('vector.vec4f.w')!;
		const doc: GraphDocument = {
			version: '2',
			nodes: [
				{
					id: 'n_vec4',
					primitive: 'vector.vec4f',
					inputs: vec4.inputs.map((port) => ({
						id: port.name,
						name: port.name,
						direction: 'in' as const,
						dataType: port.dataType,
						...(port.default !== undefined ? { default: port.default } : {})
					})),
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'vec4f' }]
				},
				{
					id: 'n_w',
					primitive: 'vector.vec4f.w',
					inputs: extractW.inputs.map((port) => ({
						id: port.name,
						name: port.name,
						direction: 'in' as const,
						dataType: port.dataType
					})),
					outputs: [{ id: 'w', name: 'w', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [{ id: 'e_vec_w', from: { node: 'n_vec4', port: 'value' }, to: { node: 'n_w', port: 'value' } }],
			outputs: [{ name: 'alpha', from: { node: 'n_w', port: 'w' } }],
		};

		expect(evaluateGraphOutput(doc, { node: 'n_w', port: 'w' }, {})).toBe(1);
	});

	it('uses edge-driven promotable param values ahead of stored literals', () => {
		const remapPrimitive = getPrimitive('math.remap')!;
		const doc: GraphDocument = {
			version: '2',
			nodes: [
				{
					id: 'n_x',
					primitive: 'constant.f32',
					params: { value: 0.5 },
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_inMax',
					primitive: 'constant.f32',
					params: { value: 10 },
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_remap',
					primitive: 'math.remap',
					params: { inMin: 0, inMax: 1, outMin: 0, outMax: 1 },
					inputs: [
						{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' },
						...paramInputPorts(remapPrimitive).map((port) => ({
							id: port.name,
							name: port.name,
							direction: 'in' as const,
							dataType: port.dataType
						}))
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [
				{
					id: 'e_x',
					from: { node: 'n_x', port: 'value' },
					to: { node: 'n_remap', port: 'x' }
				},
				{
					id: 'e_inMax',
					from: { node: 'n_inMax', port: 'value' },
					to: { node: 'n_remap', port: 'inMax' }
				}
			],
			outputs: [{ name: 'out', from: { node: 'n_remap', port: 'value' } }],
		};

		const wired = evaluateGraphOutput(doc, { node: 'n_remap', port: 'value' }, {});
		expect(wired).toBeCloseTo(0.05);

		const literalOnly = evaluateGraphOutput(
			{
				...doc,
				edges: doc.edges.filter((edge) => edge.id !== 'e_inMax')
			},
			{ node: 'n_remap', port: 'value' },
			{}
		);
		expect(literalOnly).toBeCloseTo(0.5);
	});
});
