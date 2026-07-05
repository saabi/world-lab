import '@world-lab/graph';
import {
	getPrimitive,
	migrateGraphDocument,
	pipelineFieldOutput,
	type Edge,
	type GraphDocument,
	type GraphDocumentV1,
	type Node,
	type Port,
	type PortRef
} from '@world-lab/graph';

import { instantiateNodeInputs, instantiateNodeOutputs } from './nodePortUtils.js';

function snapshotNode(
	id: string,
	primitiveId: string,
	position: { x: number; y: number },
	params?: Record<string, unknown>
): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	return {
		id,
		primitive: primitiveId,
		position,
		inputs: instantiateNodeInputs(primitive),
		outputs: instantiateNodeOutputs(primitive),
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

function edge(
	id: string,
	fromNode: string,
	fromPrimitive: string,
	toNode: string,
	toPrimitive: string,
	fromIndex: number,
	toIndex: number
): Edge {
	return {
		id,
		from: portRef(fromNode, fromPrimitive, 'out', fromIndex),
		to: portRef(toNode, toPrimitive, 'in', toIndex)
	};
}

/** ShaderToy-style pipeline: scaled fragCoord + iTime → Worley → vec4 fragment color. */
export function animatedWorleyPipelineGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.plane', { x: 361, y: -74 }, { resU: 2, resV: 2 }),
			snapshotNode('n_persist', 'buffer.persist', { x: 573, y: -48 }),
			snapshotNode('n_vertex', 'stage.vertex', { x: 815, y: 32 }),
			snapshotNode('n_fragment', 'stage.fragment', { x: 1046, y: 140 }),
			snapshotNode('n_display', 'target.display', { x: 1242, y: 169 }),
			snapshotNode('n_frag', 'host.fragCoord', { x: -192, y: 36 }),
			snapshotNode('n_vector_vec4f_2', 'vector.vec4f', { x: 815, y: 180 }),
			snapshotNode('n_constant_f32_1', 'constant.f32', { x: 586, y: 313 }, { value: 1 }),
			snapshotNode('n_noise_worley2d_4', 'noise.worley2d', { x: 588, y: 84 }),
			snapshotNode('n_constant_f32_5', 'constant.f32', { x: -198, y: 123 }, { value: 0.02 }),
			snapshotNode('n_vector_mulScalar_vec2f_6', 'vector.mulScalar.vec2f', { x: 11, y: 35 }),
			snapshotNode('n_host_iTime_7', 'host.iTime', { x: -187, y: 345 }),
			snapshotNode('n_vector_vec2f_8', 'vector.vec2f', { x: 11, y: 122 }),
			snapshotNode('n_vector_add_vec2f_1', 'vector.add.vec2f', { x: 392, y: 58 }),
			snapshotNode('n_noise_perlin2d_5', 'noise.perlin2d', { x: 589, y: 158 }),
			snapshotNode('n_noise_perlin3d_3', 'noise.perlin3d', { x: 588, y: 233 }),
			snapshotNode('n_vector_vec2f_6', 'vector.vec2f', { x: 14, y: 212 }),
			snapshotNode('n_vector_add_vec2f_7', 'vector.add.vec2f', { x: 396, y: 149 }),
			snapshotNode('n_vector_vec3f_9', 'vector.vec3f', { x: 400, y: 327 }),
			snapshotNode('n_vector_vec2f_x_10', 'vector.vec2f.x', { x: 217, y: 232 }),
			snapshotNode('n_vector_vec2f_y_11', 'vector.vec2f.y', { x: 217, y: 305 }),
			snapshotNode('n_stage_fragment_12', 'stage.fragment', { x: 1043, y: 260 }),
			snapshotNode('n_vector_vec4f_3', 'vector.vec4f', { x: 815, y: 323 }),
			snapshotNode('n_target_display_1', 'target.display', { x: 1249, y: 289 })
		],
		edges: [
			edge('e_plane_persist', 'n_plane', 'geometry.plane', 'n_persist', 'buffer.persist', 0, 0),
			edge('e_persist_vertex', 'n_persist', 'buffer.persist', 'n_vertex', 'stage.vertex', 0, 0),
			edge('e_vertex_frag1', 'n_vertex', 'stage.vertex', 'n_fragment', 'stage.fragment', 0, 0),
			edge('e_frag_mul', 'n_frag', 'host.fragCoord', 'n_vector_mulScalar_vec2f_6', 'vector.mulScalar.vec2f', 0, 0),
			edge('e_scale_mul', 'n_constant_f32_5', 'constant.f32', 'n_vector_mulScalar_vec2f_6', 'vector.mulScalar.vec2f', 0, 1),
			edge('e_mul_add1_a', 'n_vector_mulScalar_vec2f_6', 'vector.mulScalar.vec2f', 'n_vector_add_vec2f_1', 'vector.add.vec2f', 0, 0),
			edge('e_time_v2_8x', 'n_host_iTime_7', 'host.iTime', 'n_vector_vec2f_8', 'vector.vec2f', 0, 0),
			edge('e_v2_8_add1_b', 'n_vector_vec2f_8', 'vector.vec2f', 'n_vector_add_vec2f_1', 'vector.add.vec2f', 0, 1),
			edge('e_add1_worley', 'n_vector_add_vec2f_1', 'vector.add.vec2f', 'n_noise_worley2d_4', 'noise.worley2d', 0, 0),
			edge('e_worley_v4_2x', 'n_noise_worley2d_4', 'noise.worley2d', 'n_vector_vec4f_2', 'vector.vec4f', 0, 0),
			edge('e_time_v2_6y', 'n_host_iTime_7', 'host.iTime', 'n_vector_vec2f_6', 'vector.vec2f', 0, 1),
			edge('e_v2_6_add7_b', 'n_vector_vec2f_6', 'vector.vec2f', 'n_vector_add_vec2f_7', 'vector.add.vec2f', 0, 1),
			edge('e_mul_add7_a', 'n_vector_mulScalar_vec2f_6', 'vector.mulScalar.vec2f', 'n_vector_add_vec2f_7', 'vector.add.vec2f', 0, 0),
			edge('e_add7_perlin2d', 'n_vector_add_vec2f_7', 'vector.add.vec2f', 'n_noise_perlin2d_5', 'noise.perlin2d', 0, 0),
			edge('e_perlin2d_v4_2y', 'n_noise_perlin2d_5', 'noise.perlin2d', 'n_vector_vec4f_2', 'vector.vec4f', 0, 1),
			edge('e_mul_v2x', 'n_vector_mulScalar_vec2f_6', 'vector.mulScalar.vec2f', 'n_vector_vec2f_x_10', 'vector.vec2f.x', 0, 0),
			edge('e_mul_v2y', 'n_vector_mulScalar_vec2f_6', 'vector.mulScalar.vec2f', 'n_vector_vec2f_y_11', 'vector.vec2f.y', 0, 0),
			edge('e_v2x_v3_9x', 'n_vector_vec2f_x_10', 'vector.vec2f.x', 'n_vector_vec3f_9', 'vector.vec3f', 0, 0),
			edge('e_v2y_v3_9y', 'n_vector_vec2f_y_11', 'vector.vec2f.y', 'n_vector_vec3f_9', 'vector.vec3f', 0, 1),
			edge('e_time_v3_9z', 'n_host_iTime_7', 'host.iTime', 'n_vector_vec3f_9', 'vector.vec3f', 0, 2),
			edge('e_v3_9_perlin3d', 'n_vector_vec3f_9', 'vector.vec3f', 'n_noise_perlin3d_3', 'noise.perlin3d', 0, 0),
			edge('e_perlin3d_v4_2z', 'n_noise_perlin3d_3', 'noise.perlin3d', 'n_vector_vec4f_2', 'vector.vec4f', 0, 2),
			edge('e_alpha_v4_2w', 'n_constant_f32_1', 'constant.f32', 'n_vector_vec4f_2', 'vector.vec4f', 0, 3),
			edge('e_v4_2_frag1', 'n_vector_vec4f_2', 'vector.vec4f', 'n_fragment', 'stage.fragment', 0, 1),
			edge('e_frag1_display', 'n_fragment', 'stage.fragment', 'n_display', 'target.display', 0, 0),
			edge('e_vertex_frag2', 'n_vertex', 'stage.vertex', 'n_stage_fragment_12', 'stage.fragment', 0, 0),
			edge('e_perlin3d_v4_3z', 'n_noise_perlin3d_3', 'noise.perlin3d', 'n_vector_vec4f_3', 'vector.vec4f', 0, 2),
			edge('e_alpha_v4_3w', 'n_constant_f32_1', 'constant.f32', 'n_vector_vec4f_3', 'vector.vec4f', 0, 3),
			edge('e_v4_3_frag2', 'n_vector_vec4f_3', 'vector.vec4f', 'n_stage_fragment_12', 'stage.fragment', 0, 1),
			edge('e_frag2_display2', 'n_stage_fragment_12', 'stage.fragment', 'n_target_display_1', 'target.display', 0, 0)
		],
		outputs: [],
	};
}

/** Default uv → perlin → remap preview graph using live primitive port names. */
export function defaultPreviewGraphV1(): GraphDocumentV1 {
	return {
		version: '1',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv', { x: 0, y: 80 }),
			snapshotNode('n_perlin', 'noise.perlin3d', { x: 220, y: 60 }),
			snapshotNode('n_remap', 'math.remap', { x: 460, y: 80 }, {
				inMin: -1,
				inMax: 1,
				outMin: 0,
				outMax: 1
			})
		],
		edges: [
			{
				id: 'e_uv_perlin',
				from: portRef('n_uv', 'procedural.uv', 'out', 0),
				to: portRef('n_perlin', 'noise.perlin3d', 'in', 0)
			},
			{
				id: 'e_perlin_remap',
				from: portRef('n_perlin', 'noise.perlin3d', 'out', 0),
				to: portRef('n_remap', 'math.remap', 'in', 0)
			}
		],
		outputs: [{ name: 'field', from: portRef('n_remap', 'math.remap', 'out', 0) }],
		consumers: [{ type: 'preview', outputs: ['field'] }]
	};
}

export function defaultPreviewGraph(): GraphDocument {
	return migrateGraphDocument(defaultPreviewGraphV1());
}

/** Sink-free ShaderToy V1 fixture used to exercise full image-pipeline migration. */
export function legacyFullscreenFragmentGraphV1(): GraphDocumentV1 {
	return {
		version: '1',
		nodes: [
			snapshotNode('n_frag', 'host.fragCoord', { x: 0, y: 80 }),
			snapshotNode('n_res', 'host.iResolution', { x: 0, y: 220 }),
			snapshotNode('n_time', 'host.iTime', { x: 0, y: 360 }),
			snapshotNode('n_effect', 'effect.cosinePalette', { x: 280, y: 200 })
		],
		edges: [
			edge('e_frag_effect', 'n_frag', 'host.fragCoord', 'n_effect', 'effect.cosinePalette', 0, 0),
			edge('e_res_effect', 'n_res', 'host.iResolution', 'n_effect', 'effect.cosinePalette', 0, 1),
			edge('e_time_effect', 'n_time', 'host.iTime', 'n_effect', 'effect.cosinePalette', 0, 2)
		],
		outputs: [{ name: 'image', from: portRef('n_effect', 'effect.cosinePalette', 'out', 0) }],
		consumers: [{ type: 'image', id: 'image', stage: 'fragment', outputs: ['image'] }]
	};
}

export function legacyFullscreenFragmentGraph(): GraphDocument {
	return migrateGraphDocument(legacyFullscreenFragmentGraphV1());
}

/** ShaderToy S0: explicit pipeline nodes with the cosine palette as the fragment field. */
export function cosinePaletteEffectGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.plane', { x: 0, y: 40 }, { resU: 2, resV: 2 }),
			snapshotNode('n_persist', 'buffer.persist', { x: 240, y: 40 }),
			snapshotNode('n_vertex', 'stage.vertex', { x: 480, y: 40 }),
			snapshotNode('n_fragment', 'stage.fragment', { x: 740, y: 160 }),
			snapshotNode('n_display', 'target.display', { x: 1000, y: 160 }),
			snapshotNode('n_frag', 'host.fragCoord', { x: 220, y: 280 }),
			snapshotNode('n_res', 'host.iResolution', { x: 220, y: 400 }),
			snapshotNode('n_time', 'host.iTime', { x: 220, y: 520 }),
			snapshotNode('n_effect', 'effect.cosinePalette', { x: 500, y: 400 })
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

/** Foundation 2 proof: display B samples display A through input.channel in the same frame. */
export function crossPassTextureReadGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.plane', { x: 0, y: 40 }, { resU: 2, resV: 2 }),
			snapshotNode('n_persist', 'buffer.persist', { x: 220, y: 40 }),
			snapshotNode('n_vertex', 'stage.vertex', { x: 440, y: 40 }),
			snapshotNode('n_red', 'constant.f32', { x: 180, y: 180 }, { value: 0.2 }),
			snapshotNode('n_green', 'constant.f32', { x: 180, y: 240 }, { value: 0.55 }),
			snapshotNode('n_blue', 'constant.f32', { x: 180, y: 300 }, { value: 0.9 }),
			snapshotNode('n_alpha', 'constant.f32', { x: 180, y: 360 }, { value: 1 }),
			snapshotNode('n_base', 'vector.vec4f', { x: 420, y: 240 }),
			snapshotNode('n_fragment_a', 'stage.fragment', { x: 680, y: 100 }),
			snapshotNode('n_display_a', 'target.display', { x: 920, y: 100 }),
			snapshotNode(
				'n_channel',
				'input.channel',
				{ x: 420, y: 360 },
				{ channel: 0, sourceDisplayId: 'n_display_a' }
			),
			snapshotNode('n_factor', 'constant.f32', { x: 420, y: 460 }, { value: 0.65 }),
			snapshotNode('n_tint', 'vector.mulScalar.vec4f', { x: 650, y: 400 }),
			snapshotNode('n_fragment_b', 'stage.fragment', { x: 680, y: 300 }),
			snapshotNode('n_display_b', 'target.display', { x: 920, y: 300 })
		],
		edges: [
			edge('e_plane_persist', 'n_plane', 'geometry.plane', 'n_persist', 'buffer.persist', 0, 0),
			edge('e_persist_vertex', 'n_persist', 'buffer.persist', 'n_vertex', 'stage.vertex', 0, 0),
			edge('e_red_base', 'n_red', 'constant.f32', 'n_base', 'vector.vec4f', 0, 0),
			edge('e_green_base', 'n_green', 'constant.f32', 'n_base', 'vector.vec4f', 0, 1),
			edge('e_blue_base', 'n_blue', 'constant.f32', 'n_base', 'vector.vec4f', 0, 2),
			edge('e_alpha_base', 'n_alpha', 'constant.f32', 'n_base', 'vector.vec4f', 0, 3),
			edge('e_vertex_fragment_a', 'n_vertex', 'stage.vertex', 'n_fragment_a', 'stage.fragment', 0, 0),
			edge('e_base_fragment_a', 'n_base', 'vector.vec4f', 'n_fragment_a', 'stage.fragment', 0, 1),
			edge('e_fragment_display_a', 'n_fragment_a', 'stage.fragment', 'n_display_a', 'target.display', 0, 0),
			edge('e_vertex_fragment_b', 'n_vertex', 'stage.vertex', 'n_fragment_b', 'stage.fragment', 0, 0),
			edge('e_channel_tint', 'n_channel', 'input.channel', 'n_tint', 'vector.mulScalar.vec4f', 0, 0),
			edge('e_factor_tint', 'n_factor', 'constant.f32', 'n_tint', 'vector.mulScalar.vec4f', 0, 1),
			edge('e_tint_fragment_b', 'n_tint', 'vector.mulScalar.vec4f', 'n_fragment_b', 'stage.fragment', 0, 1),
			edge('e_fragment_display_b', 'n_fragment_b', 'stage.fragment', 'n_display_b', 'target.display', 0, 0)
		],
		outputs: [
			{ name: 'base', from: portRef('n_base', 'vector.vec4f', 'out', 0) },
			{ name: 'channel_read', from: portRef('n_tint', 'vector.mulScalar.vec4f', 'out', 0) }
		]
	};
}

/** Foundation 2 proof; dimensions intentionally match createPreviewFrameLoop's 256px default. */
export function bufferFeedbackGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode(
				'n_buffer_feedback',
				'target.bufferFeedback',
				{ x: 320, y: 180 },
				{ gridWidth: 256, gridHeight: 256 }
			)
		],
		edges: [],
		outputs: []
	};
}

/**
 * Mesh preview sample: UV → cube face → spherify → Perlin height → normal displace → target.mesh.
 * Load from the document picker; select the mesh buffer tab in preview to see the bumpy sphere.
 */
export function displacedSphereMeshGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv', { x: 0, y: 120 }),
			snapshotNode('n_face', 'surface.cubeFace', { x: 220, y: 100 }, { face: 0 }),
			snapshotNode('n_sph', 'transform.spherify', { x: 460, y: 100 }),
			snapshotNode('n_noise', 'noise.perlin3d', { x: 460, y: 280 }),
			snapshotNode('n_disp', 'transform.normalDisplace', { x: 720, y: 180 }),
			snapshotNode('n_mesh', 'target.mesh', { x: 980, y: 160 }, { gridSize: 24, faceCount: 6 })
		],
		edges: [
			edge('e_uv_face', 'n_uv', 'procedural.uv', 'n_face', 'surface.cubeFace', 0, 0),
			edge('e_face_sph', 'n_face', 'surface.cubeFace', 'n_sph', 'transform.spherify', 0, 0),
			edge('e_sph_noise', 'n_sph', 'transform.spherify', 'n_noise', 'noise.perlin3d', 0, 0),
			edge('e_sph_disp_pos', 'n_sph', 'transform.spherify', 'n_disp', 'transform.normalDisplace', 0, 0),
			edge('e_sph_disp_norm', 'n_sph', 'transform.spherify', 'n_disp', 'transform.normalDisplace', 0, 1),
			edge('e_noise_disp_h', 'n_noise', 'noise.perlin3d', 'n_disp', 'transform.normalDisplace', 0, 2),
			edge('e_disp_mesh_pos', 'n_disp', 'transform.normalDisplace', 'n_mesh', 'target.mesh', 0, 0),
			edge('e_sph_mesh_norm', 'n_sph', 'transform.spherify', 'n_mesh', 'target.mesh', 0, 1)
		],
		outputs: [],
	};
}

/**
 * Mesh preview sample: tilted plane via `transform.rotate` (visual gate for rigid transforms).
 */
export function rotatedPlaneMeshGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv', { x: 0, y: 120 }),
			snapshotNode('n_plane', 'surface.plane', { x: 220, y: 100 }),
			snapshotNode('n_rot', 'transform.rotate', { x: 460, y: 100 }, { rotationX: 0.65, rotationY: 0, rotationZ: 0 }),
			snapshotNode('n_mesh', 'target.mesh', { x: 720, y: 100 }, { gridSize: 24, faceCount: 1 })
		],
		edges: [
			edge('e_uv_plane', 'n_uv', 'procedural.uv', 'n_plane', 'surface.plane', 0, 0),
			edge('e_plane_rot', 'n_plane', 'surface.plane', 'n_rot', 'transform.rotate', 0, 0),
			edge('e_rot_mesh_pos', 'n_rot', 'transform.rotate', 'n_mesh', 'target.mesh', 0, 0),
			edge('e_plane_mesh_norm', 'n_plane', 'surface.plane', 'n_mesh', 'target.mesh', 0, 1)
		],
		outputs: [],
	};
}

/**
 * Mesh preview sample: plane through scale → rotate → translate → target.mesh.
 * Demonstrates all Slice B rigid transforms in one graph.
 */
export function rigidTransformsMeshGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv', { x: 0, y: 160 }),
			snapshotNode('n_plane', 'surface.plane', { x: 200, y: 140 }),
			snapshotNode('n_factor', 'constant.f32', { x: 200, y: 280 }, { value: 1.6 }),
			snapshotNode('n_scale', 'transform.scale', { x: 420, y: 160 }),
			snapshotNode('n_rot', 'transform.rotate', { x: 640, y: 140 }, {
				rotationX: 0.55,
				rotationY: 0.35,
				rotationZ: 0
			}),
			snapshotNode('n_off_x', 'constant.f32', { x: 640, y: 280 }, { value: 0 }),
			snapshotNode('n_off_y', 'constant.f32', { x: 640, y: 340 }, { value: 0.4 }),
			snapshotNode('n_off_z', 'constant.f32', { x: 640, y: 400 }, { value: 0.15 }),
			snapshotNode('n_offset', 'vector.vec3f', { x: 820, y: 320 }),
			snapshotNode('n_translate', 'transform.translate', { x: 1020, y: 180 }),
			snapshotNode('n_mesh', 'target.mesh', { x: 1240, y: 160 }, { gridSize: 28, faceCount: 1 })
		],
		edges: [
			edge('e_uv_plane', 'n_uv', 'procedural.uv', 'n_plane', 'surface.plane', 0, 0),
			edge('e_plane_scale', 'n_plane', 'surface.plane', 'n_scale', 'transform.scale', 0, 0),
			edge('e_factor_scale', 'n_factor', 'constant.f32', 'n_scale', 'transform.scale', 0, 1),
			edge('e_scale_rot', 'n_scale', 'transform.scale', 'n_rot', 'transform.rotate', 0, 0),
			edge('e_rot_trans', 'n_rot', 'transform.rotate', 'n_translate', 'transform.translate', 0, 0),
			edge('e_off_x', 'n_off_x', 'constant.f32', 'n_offset', 'vector.vec3f', 0, 0),
			edge('e_off_y', 'n_off_y', 'constant.f32', 'n_offset', 'vector.vec3f', 0, 1),
			edge('e_off_z', 'n_off_z', 'constant.f32', 'n_offset', 'vector.vec3f', 0, 2),
			edge('e_offset_trans', 'n_offset', 'vector.vec3f', 'n_translate', 'transform.translate', 0, 1),
			edge('e_trans_mesh', 'n_translate', 'transform.translate', 'n_mesh', 'target.mesh', 0, 0),
			edge('e_plane_norm', 'n_plane', 'surface.plane', 'n_mesh', 'target.mesh', 0, 1)
		],
		outputs: [],
	};
}

export function primaryPreviewOutput(doc: GraphDocument): PortRef | null {
	return doc.outputs[0]?.from ?? pipelineFieldOutput(doc);
}

export function outputPortDataType(doc: GraphDocument, output: PortRef): string | null {
	const node = doc.nodes.find((candidate) => candidate.id === output.node);
	if (!node) return null;
	const port = node.outputs.find(
		(candidate) => candidate.id === output.port || candidate.name === output.port
	);
	return port?.dataType ?? null;
}
