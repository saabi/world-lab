import '@world-lab/graph';
import { getPrimitive, type GraphDocument, type Node, type Port, type PortRef, type PortSpec } from '@world-lab/graph';

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? 'none'
	}));
}

function snapshotNode(id: string, primitiveId: string, params?: Record<string, unknown>): Node {
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

function portRef(nodeId: string, primitiveId: string, direction: 'in' | 'out', index: number): PortRef {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	const ports = direction === 'in' ? primitive.inputs : primitive.outputs;
	const port = ports[index];
	if (!port) {
		throw new Error(`Missing ${direction} port ${index} on ${primitiveId}`);
	}
	return { node: nodeId, port: port.name };
}

/** ShaderToy cosine palette with explicit pipeline nodes. */
export function cosinePalettePipelineGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.plane', { resU: 2, resV: 2 }),
			snapshotNode('n_persist', 'buffer.persist'),
			snapshotNode('n_vertex', 'stage.vertex'),
			snapshotNode('n_fragment', 'stage.fragment'),
			snapshotNode('n_display', 'target.display'),
			snapshotNode('n_frag', 'host.fragCoord'),
			snapshotNode('n_res', 'host.iResolution'),
			snapshotNode('n_time', 'host.iTime'),
			snapshotNode('n_effect', 'effect.cosinePalette')
		],
		edges: [
			{
				id: 'e_plane_persist',
				from: portRef('n_plane', 'geometry.plane', 'out', 0),
				to: portRef('n_persist', 'buffer.persist', 'in', 0)
			},
			{
				id: 'e_persist_vertex',
				from: portRef('n_persist', 'buffer.persist', 'out', 0),
				to: portRef('n_vertex', 'stage.vertex', 'in', 0)
			},
			{
				id: 'e_vertex_fragment',
				from: portRef('n_vertex', 'stage.vertex', 'out', 0),
				to: portRef('n_fragment', 'stage.fragment', 'in', 0)
			},
			{
				id: 'e_frag_effect',
				from: portRef('n_frag', 'host.fragCoord', 'out', 0),
				to: portRef('n_effect', 'effect.cosinePalette', 'in', 0)
			},
			{
				id: 'e_res_effect',
				from: portRef('n_res', 'host.iResolution', 'out', 0),
				to: portRef('n_effect', 'effect.cosinePalette', 'in', 1)
			},
			{
				id: 'e_time_effect',
				from: portRef('n_time', 'host.iTime', 'out', 0),
				to: portRef('n_effect', 'effect.cosinePalette', 'in', 2)
			},
			{
				id: 'e_effect_fragment',
				from: portRef('n_effect', 'effect.cosinePalette', 'out', 0),
				to: portRef('n_fragment', 'stage.fragment', 'in', 1)
			},
			{
				id: 'e_fragment_display',
				from: portRef('n_fragment', 'stage.fragment', 'out', 0),
				to: portRef('n_display', 'target.display', 'in', 0)
			}
		],
		outputs: [{ name: 'image', from: portRef('n_effect', 'effect.cosinePalette', 'out', 0) }],
	};
}

/** Standing regression for GraphParams binding (constant.f32 param in fragment field). */
export function constantVec4FragmentGraph(): GraphDocument {
	const constOut = portRef('n_const', 'constant.f32', 'out', 0);
	const vec4In = (index: number) => portRef('n_vec4', 'vector.vec4f', 'in', index);
	return {
		version: '2',
		nodes: [
			snapshotNode('n_const', 'constant.f32', { value: 0.75 }),
			snapshotNode('n_vec4', 'vector.vec4f')
		],
		edges: [
			{ id: 'e_const_x', from: constOut, to: vec4In(0) },
			{ id: 'e_const_y', from: constOut, to: vec4In(1) },
			{ id: 'e_const_z', from: constOut, to: vec4In(2) },
			{ id: 'e_const_w', from: constOut, to: vec4In(3) }
		],
		outputs: [{ name: 'image', from: portRef('n_vec4', 'vector.vec4f', 'out', 0) }],
	};
}

/** Worley + iTime → vec4f pipeline (metadata-empty; relies on effectiveGraphDocument). */
export function worleyPipelineGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.plane', { resU: 2, resV: 2 }),
			snapshotNode('n_persist', 'buffer.persist'),
			snapshotNode('n_vertex', 'stage.vertex'),
			snapshotNode('n_fragment', 'stage.fragment'),
			snapshotNode('n_display', 'target.display'),
			snapshotNode('n_frag', 'host.fragCoord'),
			snapshotNode('n_vector_vec4f', 'vector.vec4f'),
			snapshotNode('n_constant_w', 'constant.f32', { value: 1 }),
			snapshotNode('n_worley', 'noise.worley2d'),
			snapshotNode('n_scale', 'constant.f32', { value: 0.01 }),
			snapshotNode('n_mul', 'vector.mulScalar.vec2f'),
			snapshotNode('n_time', 'host.iTime'),
			snapshotNode('n_offset', 'vector.vec2f'),
			snapshotNode('n_add', 'vector.add.vec2f')
		],
		edges: [
			{
				id: 'e_plane_persist',
				from: portRef('n_plane', 'geometry.plane', 'out', 0),
				to: portRef('n_persist', 'buffer.persist', 'in', 0)
			},
			{
				id: 'e_persist_vertex',
				from: portRef('n_persist', 'buffer.persist', 'out', 0),
				to: portRef('n_vertex', 'stage.vertex', 'in', 0)
			},
			{
				id: 'e_vertex_fragment',
				from: portRef('n_vertex', 'stage.vertex', 'out', 0),
				to: portRef('n_fragment', 'stage.fragment', 'in', 0)
			},
			{
				id: 'e_fragment_display',
				from: portRef('n_fragment', 'stage.fragment', 'out', 0),
				to: portRef('n_display', 'target.display', 'in', 0)
			},
			{
				id: 'e_frag_mul',
				from: portRef('n_frag', 'host.fragCoord', 'out', 0),
				to: portRef('n_mul', 'vector.mulScalar.vec2f', 'in', 0)
			},
			{
				id: 'e_scale_mul',
				from: portRef('n_scale', 'constant.f32', 'out', 0),
				to: portRef('n_mul', 'vector.mulScalar.vec2f', 'in', 1)
			},
			{
				id: 'e_worley_vec4_x',
				from: portRef('n_worley', 'noise.worley2d', 'out', 0),
				to: portRef('n_vector_vec4f', 'vector.vec4f', 'in', 0)
			},
			{
				id: 'e_worley_vec4_y',
				from: portRef('n_worley', 'noise.worley2d', 'out', 0),
				to: portRef('n_vector_vec4f', 'vector.vec4f', 'in', 1)
			},
			{
				id: 'e_worley_vec4_z',
				from: portRef('n_worley', 'noise.worley2d', 'out', 0),
				to: portRef('n_vector_vec4f', 'vector.vec4f', 'in', 2)
			},
			{
				id: 'e_w_vec4_w',
				from: portRef('n_constant_w', 'constant.f32', 'out', 0),
				to: portRef('n_vector_vec4f', 'vector.vec4f', 'in', 3)
			},
			{
				id: 'e_vec4_fragment',
				from: portRef('n_vector_vec4f', 'vector.vec4f', 'out', 0),
				to: portRef('n_fragment', 'stage.fragment', 'in', 1)
			},
			{
				id: 'e_time_offset_y',
				from: portRef('n_time', 'host.iTime', 'out', 0),
				to: portRef('n_offset', 'vector.vec2f', 'in', 1)
			},
			{
				id: 'e_mul_add_a',
				from: portRef('n_mul', 'vector.mulScalar.vec2f', 'out', 0),
				to: portRef('n_add', 'vector.add.vec2f', 'in', 0)
			},
			{
				id: 'e_offset_add_b',
				from: portRef('n_offset', 'vector.vec2f', 'out', 0),
				to: portRef('n_add', 'vector.add.vec2f', 'in', 1)
			},
			{
				id: 'e_add_worley',
				from: portRef('n_add', 'vector.add.vec2f', 'out', 0),
				to: portRef('n_worley', 'noise.worley2d', 'in', 0)
			}
		],
		outputs: [],
	};
}

export function planeScalarPreviewGraph(): GraphDocument {
	return {
		version: '2',
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
	};
}
