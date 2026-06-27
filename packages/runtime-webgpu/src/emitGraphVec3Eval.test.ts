import '@virtual-planet/graph';
import { getPrimitive, type GraphDocument, type Node, type Port, type PortSpec } from '@virtual-planet/graph';
import { describe, expect, it } from 'vitest';
import { emitGraphVec3Eval } from './emitGraphVec3Eval.js';

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

describe('@virtual-planet/runtime-webgpu emitGraphVec3Eval', () => {
	it('emits metricPosition as direct vec3f output', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [snapshotNode('n_pos', 'procedural.metricPosition')],
			edges: [],
			outputs: [{ name: 'position', from: { node: 'n_pos', port: 'position' } }],
			consumers: [{ type: 'preview', outputs: ['position'] }]
		};

		const emitted = emitGraphVec3Eval(graph, { node: 'n_pos', port: 'position' });
		const body = emitted.body.join('\n');

		expect(body).toContain('vec3<f32>(u, v, 0.0)');
		expect(body).toContain('v_n_pos_position');
		expect(emitted.resultExpr).toBe('v_n_pos_position');
	});

	it('uses positionExpr when provided', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [snapshotNode('n_pos', 'procedural.metricPosition')],
			edges: [],
			outputs: [{ name: 'position', from: { node: 'n_pos', port: 'position' } }],
			consumers: [{ type: 'preview', outputs: ['position'] }]
		};

		const emitted = emitGraphVec3Eval(
			graph,
			{ node: 'n_pos', port: 'position' },
			{ positionExpr: 'position' }
		);

		expect(emitted.body.join('\n')).toContain('= position;');
	});

	it('collects params for parameterized vec3 surface nodes', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [
				snapshotNode('n_uv', 'procedural.uv'),
				snapshotNode('n_sphere', 'surface.cubeSphere', { face: 2 })
			],
			edges: [
				{
					id: 'e_uv_sphere',
					from: { node: 'n_uv', port: 'uv' },
					to: { node: 'n_sphere', port: 'uv' }
				}
			],
			outputs: [{ name: 'position', from: { node: 'n_sphere', port: 'position' } }],
			consumers: [{ type: 'preview', outputs: ['position'] }]
		};

		const emitted = emitGraphVec3Eval(graph, { node: 'n_sphere', port: 'position' });
		const body = emitted.body.join('\n');

		expect(body).toContain('vec2<f32>(u, v)');
		expect(body).toContain('cubeSphere(');
		expect(emitted.resultExpr).toBe('v_n_sphere_position');
		expect(emitted.params.some((field) => field.paramName === 'face')).toBe(true);
	});

	it('rejects non-vec3f output ports', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [
				snapshotNode('n_uv', 'procedural.uv'),
				snapshotNode('n_perlin', 'noise.perlin3d')
			],
			edges: [
				{
					id: 'e_uv_perlin',
					from: { node: 'n_uv', port: 'uv' },
					to: { node: 'n_perlin', port: 'position' }
				}
			],
			outputs: [{ name: 'field', from: { node: 'n_perlin', port: 'value' } }],
			consumers: [{ type: 'preview', outputs: ['field'] }]
		};

		expect(() => emitGraphVec3Eval(graph, { node: 'n_perlin', port: 'value' })).toThrow(
			/emitGraphVec3Eval requires vec3f output/
		);
	});
});
