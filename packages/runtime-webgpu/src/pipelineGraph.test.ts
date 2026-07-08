import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import {
	getPrimitive,
	registerPrimitive,
	type GraphDocument,
	type Node,
	type NodePrimitive,
	type NodePrimitiveInput,
	type Port,
	type PortRef,
	type PortSpec
} from '@world-lab/graph';
import { Type } from '@world-lab/schema';

import {
	geometryCacheFingerprint,
	graphWithVertexKernelAssemblyOutputs,
	PipelineGraphExecutor,
	planPipelineGraph
} from './pipelineGraph.js';
import { createStandardLibraryResolver } from './moduleResolver.js';
import { assembleVertexKernelPositionModuleAsync } from './vertexKernelPosition.js';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

const F361_VERTEX_ID = 'test.f361PipelineGraphVertexStage';
const F361_FRAGMENT_ID = 'test.f361PipelineGraphFragmentStage';
const F361_TARGET_ID = 'test.f361PipelineGraphDisplayTarget';
const F362_FRAGMENT_ID = 'test.f362PipelineGraphKernelFragmentStage';

function testPrimitive(input: NodePrimitiveInput): NodePrimitive {
	const existing = getPrimitive(input.id);
	if (existing) return existing;
	registerPrimitive(input);
	return getPrimitive(input.id)!;
}

function testVertexStagePrimitive(): NodePrimitive {
	return testPrimitive({
		id: F361_VERTEX_ID,
		category: 'test/stage',
		inputs: [{ name: 'mesh', dataType: 'geometry' }],
		outputs: [{ name: 'varyings', dataType: 'varyings' }],
		params: Type.Object({}),
		implementation: { kind: 'legacy-structural', marker: F361_VERTEX_ID },
		metadata: {
			description: 'F3.6.1 test-only vertex stage fixture.',
			role: 'pipelineStage',
			pipelineStageKind: 'vertex'
		}
	});
}

function testFragmentStagePrimitive(): NodePrimitive {
	return testPrimitive({
		id: F361_FRAGMENT_ID,
		category: 'test/stage',
		inputs: [
			{ name: 'varyings', dataType: 'varyings' },
			{ name: 'color', dataType: 'vec4f' }
		],
		outputs: [{ name: 'texture', dataType: 'texture' }],
		params: Type.Object({}),
		implementation: { kind: 'legacy-structural', marker: F361_FRAGMENT_ID },
		metadata: {
			description: 'F3.6.1 test-only fragment stage fixture.',
			role: 'pipelineStage',
			pipelineStageKind: 'fragment'
		}
	});
}

function testDisplayTargetPrimitive(): NodePrimitive {
	return testPrimitive({
		id: F361_TARGET_ID,
		category: 'test/target',
		inputs: [{ name: 'color', dataType: 'texture' }],
		outputs: [],
		params: Type.Object({}),
		implementation: {
			kind: 'sink',
			sink: {
				kind: 'test.f361Display',
				deriveInvocation() {
					return null;
				}
			}
		},
		metadata: {
			description: 'F3.6.1 test-only display target fixture.',
			role: 'pipelineTarget'
		}
	});
}

function testKernelFragmentStagePrimitive(): NodePrimitive {
	return testPrimitive({
		id: F362_FRAGMENT_ID,
		category: 'test/stage',
		inputs: [
			{ name: 'varyings', dataType: 'varyings' },
			{ name: 'color', dataType: 'vec4f' }
		],
		outputs: [{ name: 'texture', dataType: 'texture' }],
		params: Type.Object({}),
		implementation: {
			kind: 'kernel',
			stage: 'fragment',
			bindings: [
				{
					name: 'tint',
					binding: 0,
					resourceKind: 'buffer',
					access: 'read',
					stages: ['fragment']
				}
			]
		},
		metadata: {
			description: 'F3.6.2 test-only kernel fragment fixture.',
			role: 'pipelineStage',
			pipelineStageKind: 'fragment'
		}
	});
}

function dualTargetPipelineGraph(): GraphDocument {
	const fieldA = portRef('n_field_a', 'vector.vec4f', 'out', 0);
	const fieldB = portRef('n_field_b', 'vector.vec4f', 'out', 0);
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.fullscreenPlane'),
			snapshotNode('n_persist', 'buffer.persist'),
			snapshotNode('n_vertex', 'stage.vertex'),
			snapshotNode('n_fragment_a', 'stage.fragment'),
			snapshotNode('n_fragment_b', 'stage.fragment'),
			snapshotNode('n_display_a', 'target.display'),
			snapshotNode('n_display_b', 'target.display'),
			snapshotNode('n_field_a', 'vector.vec4f'),
			snapshotNode('n_field_b', 'vector.vec4f')
		],
		edges: [
			{
				id: 'e_plane_persist',
				from: portRef('n_plane', 'geometry.fullscreenPlane', 'out', 0),
				to: portRef('n_persist', 'buffer.persist', 'in', 0)
			},
			{
				id: 'e_persist_vertex',
				from: portRef('n_persist', 'buffer.persist', 'out', 0),
				to: portRef('n_vertex', 'stage.vertex', 'in', 0)
			},
			{
				id: 'e_vertex_fragment_a',
				from: portRef('n_vertex', 'stage.vertex', 'out', 0),
				to: portRef('n_fragment_a', 'stage.fragment', 'in', 0)
			},
			{
				id: 'e_vertex_fragment_b',
				from: portRef('n_vertex', 'stage.vertex', 'out', 0),
				to: portRef('n_fragment_b', 'stage.fragment', 'in', 0)
			},
			{
				id: 'e_field_a_fragment_a',
				from: fieldA,
				to: portRef('n_fragment_a', 'stage.fragment', 'in', 1)
			},
			{
				id: 'e_field_b_fragment_b',
				from: fieldB,
				to: portRef('n_fragment_b', 'stage.fragment', 'in', 1)
			},
			{
				id: 'e_fragment_a_display_a',
				from: portRef('n_fragment_a', 'stage.fragment', 'out', 0),
				to: portRef('n_display_a', 'target.display', 'in', 0)
			},
			{
				id: 'e_fragment_b_display_b',
				from: portRef('n_fragment_b', 'stage.fragment', 'out', 0),
				to: portRef('n_display_b', 'target.display', 'in', 0)
			}
		],
		outputs: [],
	};
}

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
		params,
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out')
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

function pipelineGraph(params?: Record<string, unknown>): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.fullscreenPlane', params),
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
				from: portRef('n_plane', 'geometry.fullscreenPlane', 'out', 0),
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

function vertexKernelPipelineGraph(options: {
	missingPosition?: boolean;
	collidingPositionOutput?: boolean;
} = {}): GraphDocument {
	const outputs = [
		{ name: 'image', from: portRef('n_color', 'vector.combine.vec2f_f32_f32', 'out', 0) }
	];
	if (options.collidingPositionOutput) {
		outputs.unshift({
			name: 'position',
			from: portRef('n_color', 'vector.combine.vec2f_f32_f32', 'out', 0)
		});
	}

	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.plane', { resU: 8, resV: 8 }),
			snapshotNode('n_persist', 'buffer.persist'),
			snapshotNode('n_vertex', 'stage.vertexKernel'),
			snapshotNode('n_fragment', 'stage.fragmentKernel'),
			snapshotNode('n_display', 'target.display'),
			snapshotNode('n_position', 'procedural.metricPosition'),
			snapshotNode('n_x', 'vector.vec3f.x'),
			snapshotNode('n_y', 'vector.vec3f.y'),
			snapshotNode('n_z', 'vector.vec3f.z'),
			snapshotNode('n_noise', 'noise.perlin3d'),
			snapshotNode('n_abs_noise', 'math.abs'),
			snapshotNode('n_displaced_z', 'math.add'),
			snapshotNode('n_displaced_position', 'vector.vec3f'),
			snapshotNode('n_vertex_uv', 'vector.vec2f'),
			snapshotNode('n_fragment_uv', 'procedural.uv'),
			snapshotNode('n_color', 'vector.combine.vec2f_f32_f32')
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
				to: portRef('n_vertex', 'stage.vertexKernel', 'in', 0)
			},
			{
				id: 'e_vertex_fragment',
				from: portRef('n_vertex', 'stage.vertexKernel', 'out', 0),
				to: portRef('n_fragment', 'stage.fragmentKernel', 'in', 0)
			},
			{
				id: 'e_fragment_display',
				from: portRef('n_fragment', 'stage.fragmentKernel', 'out', 0),
				to: portRef('n_display', 'target.display', 'in', 0)
			},
			{ id: 'e_position_x', from: { node: 'n_position', port: 'position' }, to: { node: 'n_x', port: 'value' } },
			{ id: 'e_position_y', from: { node: 'n_position', port: 'position' }, to: { node: 'n_y', port: 'value' } },
			{ id: 'e_position_z', from: { node: 'n_position', port: 'position' }, to: { node: 'n_z', port: 'value' } },
			{ id: 'e_position_noise', from: { node: 'n_position', port: 'position' }, to: { node: 'n_noise', port: 'position' } },
			{ id: 'e_noise_abs', from: { node: 'n_noise', port: 'value' }, to: { node: 'n_abs_noise', port: 'x' } },
			{ id: 'e_z_displaced_a', from: { node: 'n_z', port: 'z' }, to: { node: 'n_displaced_z', port: 'a' } },
			{ id: 'e_noise_displaced_b', from: { node: 'n_abs_noise', port: 'value' }, to: { node: 'n_displaced_z', port: 'b' } },
			{ id: 'e_x_position', from: { node: 'n_x', port: 'x' }, to: { node: 'n_displaced_position', port: 'x' } },
			{ id: 'e_y_position', from: { node: 'n_y', port: 'y' }, to: { node: 'n_displaced_position', port: 'y' } },
			{ id: 'e_z_position', from: { node: 'n_displaced_z', port: 'value' }, to: { node: 'n_displaced_position', port: 'z' } },
			...(options.missingPosition
				? []
				: [
						{
							id: 'e_position_vertex',
							from: { node: 'n_displaced_position', port: 'value' },
							to: { node: 'n_vertex', port: 'position' }
						}
					]),
			{ id: 'e_x_uv', from: { node: 'n_x', port: 'x' }, to: { node: 'n_vertex_uv', port: 'x' } },
			{ id: 'e_height_uv', from: { node: 'n_abs_noise', port: 'value' }, to: { node: 'n_vertex_uv', port: 'y' } },
			{ id: 'e_uv_vertex', from: { node: 'n_vertex_uv', port: 'value' }, to: { node: 'n_vertex', port: 'uv' } },
			{ id: 'e_fragment_uv_color', from: { node: 'n_fragment_uv', port: 'uv' }, to: { node: 'n_color', port: 'xy' } },
			{ id: 'e_color_fragment', from: { node: 'n_color', port: 'value' }, to: { node: 'n_fragment', port: 'color' } }
		],
		outputs,
	};
}

function edgeTo(doc: GraphDocument, node: string, port: string) {
	const edge = doc.edges.find((candidate) => candidate.to.node === node && candidate.to.port === port);
	if (!edge) throw new Error(`Missing edge to ${node}.${port}`);
	return edge;
}

function replacePipelinePrimitive(
	graph: GraphDocument,
	nodeId: string,
	primitiveId: string
): GraphDocument {
	return {
		...graph,
		nodes: graph.nodes.map((node) =>
			node.id === nodeId ? snapshotNode(nodeId, primitiveId, node.params) : node
		)
	};
}

function disconnectedAltDisplayGraph(): GraphDocument {
	testDisplayTargetPrimitive();
	return {
		version: '2',
		nodes: [snapshotNode('n_alt_display', F361_TARGET_ID)],
		edges: [],
		outputs: []
	};
}

describe('@world-lab/runtime-webgpu pipeline graph', () => {
	it('plans the S0 pipeline via the generic geometry source role', () => {
		expect(planPipelineGraph(pipelineGraph())).toEqual({
			geometryNode: 'n_plane',
			geometryPrimitive: 'geometry.fullscreenPlane',
			persistNode: 'n_persist',
			vertexStageNode: 'n_vertex',
			fragmentStageNode: 'n_fragment',
			displayTargetNode: 'n_display',
			fieldOutput: { node: 'n_effect', port: 'color' }
		});
	});

	it('plans a pipeline with a nonstandard vertex-stage primitive id', () => {
		testVertexStagePrimitive();
		const graph = replacePipelinePrimitive(pipelineGraph(), 'n_vertex', F361_VERTEX_ID);
		expect(planPipelineGraph(graph)).toMatchObject({
			vertexStageNode: 'n_vertex',
			fragmentStageNode: 'n_fragment',
			fieldOutput: { node: 'n_effect', port: 'color' }
		});
	});

	it('plans a pipeline with a nonstandard fragment-stage primitive id', () => {
		testFragmentStagePrimitive();
		const graph = replacePipelinePrimitive(pipelineGraph(), 'n_fragment', F361_FRAGMENT_ID);
		expect(planPipelineGraph(graph)).toMatchObject({
			vertexStageNode: 'n_vertex',
			fragmentStageNode: 'n_fragment',
			fieldOutput: { node: 'n_effect', port: 'color' }
		});
	});

	it('finds a target-role fallback under a nonstandard target primitive id', () => {
		expect(() => planPipelineGraph(disconnectedAltDisplayGraph())).toThrow(
			'Pipeline display is missing its fragment texture input'
		);
		expect(() => planPipelineGraph(disconnectedAltDisplayGraph())).not.toThrow(
			'Pipeline graph is missing target.display execution root'
		);
	});

	it('plans the first display target by default on a multi-target graph', () => {
		const graph = dualTargetPipelineGraph();
		expect(planPipelineGraph(graph)).toMatchObject({
			displayTargetNode: 'n_display_a',
			fragmentStageNode: 'n_fragment_a',
			fieldOutput: { node: 'n_field_a', port: 'value' }
		});
	});

	it('plans the requested output field on a multi-target graph', () => {
		const graph = dualTargetPipelineGraph();
		const fieldB = { node: 'n_field_b', port: 'value' };
		expect(planPipelineGraph(graph, { output: fieldB })).toMatchObject({
			displayTargetNode: 'n_display_b',
			fragmentStageNode: 'n_fragment_b',
			fieldOutput: fieldB
		});
	});

	it('plans the requested display sink on a multi-target graph', () => {
		const graph = dualTargetPipelineGraph();
		expect(planPipelineGraph(graph, { displayNodeId: 'n_display_b' })).toMatchObject({
			displayTargetNode: 'n_display_b',
			fragmentStageNode: 'n_fragment_b',
			fieldOutput: { node: 'n_field_b', port: 'value' }
		});
	});

	it('realizes buffer.persist geometry only once across frames with the same fingerprint', () => {
		const executor = new PipelineGraphExecutor();
		const graph = pipelineGraph();
		const first = planPipelineGraph(graph);
		executor.cache.realizeGeometry(geometryCacheFingerprint(graph, first));
		const second = planPipelineGraph(graph);
		executor.cache.realizeGeometry(geometryCacheFingerprint(graph, second));
		expect(executor.cache.geometryRealizations).toBe(1);
	});

	it('re-realizes geometry when the upstream source fingerprint changes', () => {
		const executor = new PipelineGraphExecutor();
		const base = pipelineGraph();
		const changed = pipelineGraph({ resU: 4, resV: 2 });
		const basePlan = planPipelineGraph(base);
		const changedPlan = planPipelineGraph(changed);
		executor.cache.realizeGeometry(geometryCacheFingerprint(base, basePlan));
		executor.cache.realizeGeometry(geometryCacheFingerprint(changed, changedPlan));
		expect(executor.cache.geometryRealizations).toBe(2);
		expect(geometryCacheFingerprint(base, basePlan)).not.toBe(
			geometryCacheFingerprint(changed, changedPlan)
		);
	});

	it('routes kernel fragment stages before fragment assembly', async () => {
		const executor = new PipelineGraphExecutor();
		await expect(
			executor.execute({
				device: {} as GPUDevice,
				graph: pipelineGraph(),
				width: 0,
				height: 1,
				host: { iTime: 0 },
				target: {} as GPUTexture
			})
		).rejects.toThrow('width and height must be positive');

		const noStaticBindingsGraph = replacePipelinePrimitive(
			pipelineGraph(),
			'n_fragment',
			'stage.fragmentKernel'
		);
		await expect(
			executor.execute({
				device: {} as GPUDevice,
				graph: noStaticBindingsGraph,
				width: 0,
				height: 1,
				host: { iTime: 0 },
				target: {} as GPUTexture
			})
		).rejects.toThrow('width and height must be positive');

		testKernelFragmentStagePrimitive();
		const graph = replacePipelinePrimitive(pipelineGraph(), 'n_fragment', F362_FRAGMENT_ID);
		await expect(
			executor.execute({
				device: {} as GPUDevice,
				graph,
				width: 0,
				height: 1,
				host: { iTime: 0 },
				target: {} as GPUTexture
			})
		).rejects.toThrow('declares kernel bindings but no kernelFragmentBindings were supplied');
	});

	it('rejects a vertex kernel with no position input before GPU work', async () => {
		const executor = new PipelineGraphExecutor();
		await expect(
			executor.execute({
				device: {} as GPUDevice,
				graph: vertexKernelPipelineGraph({ missingPosition: true }),
				width: 1,
				height: 1,
				host: { iTime: 0 },
				target: {} as GPUTexture
			})
		).rejects.toThrow('Pipeline vertex kernel n_vertex is missing its position input');
	});

	it('augments internal vertex-kernel outputs without requiring user-declared position/uv outputs', async () => {
		const graph = vertexKernelPipelineGraph();
		await expect(
			assembleVertexKernelPositionModuleAsync({
				graph,
				output: { node: 'n_displaced_position', port: 'value' },
				uvOutput: { node: 'n_vertex_uv', port: 'value' },
				resolver: createStandardLibraryResolver()
			})
		).rejects.toThrow('Unknown output: position');

		const assembly = await assembleVertexKernelPositionModuleAsync({
			graph: graphWithVertexKernelAssemblyOutputs(
				graph,
				edgeTo(graph, 'n_vertex', 'position'),
				edgeTo(graph, 'n_vertex', 'uv')
			),
			output: { node: 'n_displaced_position', port: 'value' },
			uvOutput: { node: 'n_vertex_uv', port: 'value' },
			resolver: createStandardLibraryResolver()
		});
		expect(assembly.code).toContain('fn graph_eval_position');
		expect(assembly.code).toContain('fn graph_eval_uv');
	});

	it('filters colliding user-declared position outputs before vertex-kernel assembly', async () => {
		const graph = vertexKernelPipelineGraph({ collidingPositionOutput: true });
		const assembly = await assembleVertexKernelPositionModuleAsync({
			graph: graphWithVertexKernelAssemblyOutputs(
				graph,
				edgeTo(graph, 'n_vertex', 'position'),
				edgeTo(graph, 'n_vertex', 'uv')
			),
			output: { node: 'n_displaced_position', port: 'value' },
			uvOutput: { node: 'n_vertex_uv', port: 'value' },
			resolver: createStandardLibraryResolver()
		});

		expect(assembly.code).toContain('fn perlin3d');
		expect(assembly.code).toContain('v_n_displaced_position_value');
	});

	it('assembles the bundled vertex-kernel shape without vertex-side GraphParams', async () => {
		const graph = vertexKernelPipelineGraph();
		const assembly = await assembleVertexKernelPositionModuleAsync({
			graph: graphWithVertexKernelAssemblyOutputs(
				graph,
				edgeTo(graph, 'n_vertex', 'position'),
				edgeTo(graph, 'n_vertex', 'uv')
			),
			output: { node: 'n_displaced_position', port: 'value' },
			uvOutput: { node: 'n_vertex_uv', port: 'value' },
			resolver: createStandardLibraryResolver()
		});

		expect(assembly.code).not.toContain('GraphParams');
		expect(assembly.code).not.toContain('var<uniform> params');
	});

	it.skipIf(!hasWebGPU)('renders a non-uniform image through the vertex-kernel execution branch', async () => {
		const adapter = await navigator.gpu.requestAdapter();
		expect(adapter).toBeTruthy();
		const device = await adapter!.requestDevice();
		const width = 16;
		const height = 16;
		const target = device.createTexture({
			size: { width, height },
			format: 'rgba8unorm',
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
		});
		try {
			const result = await new PipelineGraphExecutor().execute({
				device,
				graph: vertexKernelPipelineGraph(),
				width,
				height,
				host: { iTime: 0 },
				target
			});
			const unique = new Set<string>();
			for (let i = 0; i < result.pixels.length; i += 4) {
				unique.add(result.pixels.slice(i, i + 4).join(','));
			}
			expect(unique.size).toBeGreaterThan(1);
		} finally {
			target.destroy();
			device.destroy();
		}
	});
});
