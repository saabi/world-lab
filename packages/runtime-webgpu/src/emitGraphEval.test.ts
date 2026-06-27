import '@virtual-planet/graph';
import { getPrimitive, type GraphDocument, type Node, type Port, type PortSpec } from '@virtual-planet/graph';
import { describe, expect, it } from 'vitest';
import { emitGraphScalarEval } from './emitGraphEval.js';

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? 'none'
	}));
}

function snapshotNode(
	id: string,
	primitiveId: string,
	params?: Record<string, unknown>
): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	return {
		id,
		primitive: primitiveId,
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out'),
		...(params !== undefined ? { params } : {})
	};
}

function previewGraph(): GraphDocument {
	return {
		version: '1',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv'),
			snapshotNode('n_perlin', 'noise.perlin3d'),
			snapshotNode('n_remap', 'math.remap', { inMin: -1, inMax: 1, outMin: 0, outMax: 1 })
		],
		edges: [
			{
				id: 'e_uv_perlin',
				from: { node: 'n_uv', port: 'uv' },
				to: { node: 'n_perlin', port: 'position' }
			},
			{
				id: 'e_perlin_remap',
				from: { node: 'n_perlin', port: 'value' },
				to: { node: 'n_remap', port: 'x' }
			}
		],
		outputs: [{ name: 'field', from: { node: 'n_remap', port: 'value' } }],
		consumers: [{ type: 'preview', outputs: ['field'] }]
	};
}

describe('@virtual-planet/runtime-webgpu emitGraphScalarEval', () => {
	it('emits evaluate body for uv → perlin → remap', () => {
		const graph = previewGraph();
		const emitted = emitGraphScalarEval(graph, { node: 'n_remap', port: 'value' });
		const body = emitted.body.join('\n');
		expect(body).toContain('vec2<f32>(u, v)');
		expect(body).toContain('perlin3d(');
		expect(body).toContain('remap(');
		expect(emitted.resultExpr).toBe('v_n_remap_value');
		expect(emitted.params.some((field) => field.paramName === 'inMin')).toBe(true);
	});

	it('uses positionExpr for procedural.metricPosition in scalar graphs', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [
				snapshotNode('n_pos', 'procedural.metricPosition'),
				snapshotNode('n_perlin', 'noise.perlin3d'),
				snapshotNode('n_remap', 'math.remap', { inMin: -1, inMax: 1, outMin: 0, outMax: 1 })
			],
			edges: [
				{
					id: 'e_pos_perlin',
					from: { node: 'n_pos', port: 'position' },
					to: { node: 'n_perlin', port: 'position' }
				},
				{
					id: 'e_perlin_remap',
					from: { node: 'n_perlin', port: 'value' },
					to: { node: 'n_remap', port: 'x' }
				}
			],
			outputs: [{ name: 'field', from: { node: 'n_remap', port: 'value' } }],
			consumers: [{ type: 'preview', outputs: ['field'] }]
		};

		const emitted = emitGraphScalarEval(
			graph,
			{ node: 'n_remap', port: 'value' },
			{ positionExpr: 'my_pos' }
		);

		expect(emitted.body.join('\n')).toContain('= my_pos;');
	});
});
