import { getPrimitive, registerPrimitive, type GraphDocument, type Node, type Port, type PortSpec } from '@virtual-planet/graph';
import { Type } from '@virtual-planet/schema';
import { describe, expect, it } from 'vitest';
import { emitGraphScalarEval, emitGraphVec4Eval } from './emitGraphEval.js';

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

	it('emits constants, vector constructors, and component extractors', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [
				snapshotNode('n_x', 'constant.f32', { value: 1 }),
				snapshotNode('n_y', 'constant.f32', { value: 2 }),
				snapshotNode('n_z', 'constant.f32', { value: 3 }),
				snapshotNode('n_vec', 'vector.vec3f'),
				snapshotNode('n_extract', 'vector.vec3f.z')
			],
			edges: [
				{ id: 'e_x', from: { node: 'n_x', port: 'value' }, to: { node: 'n_vec', port: 'x' } },
				{ id: 'e_y', from: { node: 'n_y', port: 'value' }, to: { node: 'n_vec', port: 'y' } },
				{ id: 'e_z', from: { node: 'n_z', port: 'value' }, to: { node: 'n_vec', port: 'z' } },
				{ id: 'e_vec', from: { node: 'n_vec', port: 'value' }, to: { node: 'n_extract', port: 'value' } }
			],
			outputs: [{ name: 'z', from: { node: 'n_extract', port: 'z' } }],
			consumers: []
		};

		const emitted = emitGraphScalarEval(graph, { node: 'n_extract', port: 'z' });
		const body = emitted.body.join('\n');
		expect(body).toContain('constantF32(params.p_n_x_value)');
		expect(body).toContain('makeVec3f(v_n_x_value, v_n_y_value, v_n_z_value)');
		expect(body).toContain('vec3fZ(v_n_vec_value)');
		expect(emitted.params.map((field) => field.field)).toEqual([
			'p_n_x_value',
			'p_n_y_value',
			'p_n_z_value'
		]);
	});

	it('emits vector math nodes in scalar graph chains', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [
				snapshotNode('n_x', 'constant.f32', { value: 3 }),
				snapshotNode('n_y', 'constant.f32', { value: 4 }),
				snapshotNode('n_z', 'constant.f32', { value: 0 }),
				snapshotNode('n_vec', 'vector.vec3f'),
				snapshotNode('n_norm', 'vector.normalize.vec3f'),
				snapshotNode('n_extract', 'vector.vec3f.z')
			],
			edges: [
				{ id: 'e_x', from: { node: 'n_x', port: 'value' }, to: { node: 'n_vec', port: 'x' } },
				{ id: 'e_y', from: { node: 'n_y', port: 'value' }, to: { node: 'n_vec', port: 'y' } },
				{ id: 'e_z', from: { node: 'n_z', port: 'value' }, to: { node: 'n_vec', port: 'z' } },
				{ id: 'e_norm', from: { node: 'n_vec', port: 'value' }, to: { node: 'n_norm', port: 'value' } },
				{ id: 'e_extract', from: { node: 'n_norm', port: 'value' }, to: { node: 'n_extract', port: 'value' } }
			],
			outputs: [{ name: 'z', from: { node: 'n_extract', port: 'z' } }],
			consumers: []
		};

		const emitted = emitGraphScalarEval(graph, { node: 'n_extract', port: 'z' });
		const body = emitted.body.join('\n');
		expect(body).toContain('makeVec3f(v_n_x_value, v_n_y_value, v_n_z_value)');
		expect(body).toContain('normalizeVec3f(v_n_vec_value)');
		expect(body).toContain('vec3fZ(v_n_norm_value)');
	});

	it('lowers list<T> inputs fed multiple scalar edges via static unroll', () => {
		try {
			registerPrimitive({
				id: 'math.listSum',
				category: 'math',
				inputs: [{ name: 'vals', dataType: 'list<f32>' }],
				outputs: [{ name: 'out', dataType: 'f32' }],
				params: Type.Object({}),
				wgsl: { moduleId: 'math.listSum', entry: 'listSum' }
			});
		} catch (e) {
			// ignore already registered
		}

		const graph: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_a',
					primitive: 'host.iTime', // outputs value of type f32, no inputs
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_b',
					primitive: 'host.iTime',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_c',
					primitive: 'host.iTime',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_sum',
					primitive: 'math.listSum',
					inputs: [{ id: 'vals', name: 'vals', direction: 'in', dataType: 'list<f32>' }],
					outputs: [{ id: 'out', name: 'out', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [
				{ id: 'e1', from: { node: 'n_a', port: 'value' }, to: { node: 'n_sum', port: 'vals' } },
				{ id: 'e2', from: { node: 'n_b', port: 'value' }, to: { node: 'n_sum', port: 'vals' } },
				{ id: 'e3', from: { node: 'n_c', port: 'value' }, to: { node: 'n_sum', port: 'vals' } }
			],
			outputs: [{ name: 'result', from: { node: 'n_sum', port: 'out' } }],
			consumers: []
		};

		const emitted = emitGraphScalarEval(graph, { node: 'n_sum', port: 'out' }, { shaderToy: true });
		const body = emitted.body.join('\n');
		
		// Assert that the inputs are unrolled inside an array<f32, 3>(...) expression
		expect(body).toContain('listSum(array<f32, 3>(v_n_a_value, v_n_b_value, v_n_c_value))');
	});

	it('lowers list<T> inputs fed a storageBuffer via a dynamic for loop', () => {
		try {
			registerPrimitive({
				id: 'test.bufSource',
				category: 'test',
				inputs: [],
				outputs: [{ name: 'buf', dataType: 'storageBuffer' }],
				params: Type.Object({}),
				wgsl: { moduleId: 'test.bufSource', entry: 'bufSource' }
			});
		} catch (e) {
			// ignore
		}

		const graph: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_buf',
					primitive: 'test.bufSource',
					inputs: [],
					outputs: [{ id: 'buf', name: 'buf', direction: 'out', dataType: 'storageBuffer' }]
				},
				{
					id: 'n_sum',
					primitive: 'math.listSum',
					inputs: [{ id: 'vals', name: 'vals', direction: 'in', dataType: 'list<f32>' }],
					outputs: [{ id: 'out', name: 'out', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [
				{ id: 'e1', from: { node: 'n_buf', port: 'buf' }, to: { node: 'n_sum', port: 'vals' } }
			],
			outputs: [{ name: 'result', from: { node: 'n_sum', port: 'out' } }],
			consumers: []
		};

		const emitted = emitGraphScalarEval(graph, { node: 'n_sum', port: 'out' });
		const body = emitted.body.join('\n');
		
		// Assert that a loop is generated to iterate over the buffer elements
		expect(body).toContain('arrayLength(&v_n_buf_buf)');
		expect(body).toContain('for (var i_n_sum_vals: u32 = 0u;');
		expect(body).toContain('listSum(v_n_buf_buf[i_n_sum_vals])');
	});

	it('emits port defaults for unconnected vector.vec4f component inputs', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [snapshotNode('n_vec4', 'vector.vec4f')],
			edges: [],
			outputs: [{ name: 'color', from: { node: 'n_vec4', port: 'value' } }],
			consumers: []
		};

		const emitted = emitGraphVec4Eval(graph, { node: 'n_vec4', port: 'value' });
		expect(emitted.body.join('\n')).toContain('makeVec4f(0.0, 0.0, 0.0, 1.0)');
	});

	it('emits combineVec3fF32 for vector.combine.vec3f_f32', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [
				snapshotNode('n_xyz', 'vector.vec3f'),
				snapshotNode('n_combine', 'vector.combine.vec3f_f32')
			],
			edges: [
				{
					id: 'e_xyz',
					from: { node: 'n_xyz', port: 'value' },
					to: { node: 'n_combine', port: 'xyz' }
				}
			],
			outputs: [{ name: 'color', from: { node: 'n_combine', port: 'value' } }],
			consumers: []
		};

		const emitted = emitGraphVec4Eval(graph, { node: 'n_combine', port: 'value' });
		expect(emitted.body.join('\n')).toContain('combineVec3fF32(v_n_xyz_value, 1.0)');
	});
});
