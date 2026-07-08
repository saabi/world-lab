import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import {
	getPrimitive,
	registerPrimitive,
	type GraphDocument,
	type KernelBindingTemplate,
	type Node,
	type NodePrimitive,
	type NodePrimitiveInput,
	type Port,
	type PortRef,
	type PortSpec
} from '@world-lab/graph';
import { Type } from '@world-lab/schema';

import {
	assembleKernelFragmentModuleAsync,
	executeKernelFragment,
	type KernelFragmentBindingInput
} from './kernelFragment.js';
import { createStandardLibraryResolver } from '../moduleResolver.js';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

const F362_FRAGMENT_ID = 'test.f362KernelFragmentStage';
const F362_OFFSET_FRAGMENT_ID = 'test.f362KernelFragmentStageOffsetBinding';
const F362_WRONG_FRAGMENT_ID = 'test.f362KernelFragmentStageWrongShape';

function testPrimitive(input: NodePrimitiveInput): NodePrimitive {
	const existing = getPrimitive(input.id);
	if (existing) return existing;
	registerPrimitive(input);
	return getPrimitive(input.id)!;
}

function kernelFragmentPrimitive(id: string, bindings: KernelBindingTemplate[]): NodePrimitive {
	return testPrimitive({
		id,
		category: 'test/stage',
		inputs: [
			{ name: 'varyings', dataType: 'varyings' },
			{ name: 'color', dataType: 'vec4f' }
		],
		outputs: [{ name: 'texture', dataType: 'texture' }],
		params: Type.Object({}),
		implementation: { kind: 'kernel', stage: 'fragment', bindings },
		metadata: {
			description: 'F3.6.2 test-only kernel-based fragment stage fixture.',
			role: 'pipelineStage',
			pipelineStageKind: 'fragment'
		}
	});
}

function tintBinding(binding = 0): KernelBindingTemplate {
	return {
		name: 'tint',
		binding,
		resourceKind: 'buffer',
		access: 'read',
		stages: ['fragment']
	};
}

function registerKernelFragmentFixtures(): void {
	kernelFragmentPrimitive(F362_FRAGMENT_ID, [tintBinding()]);
	kernelFragmentPrimitive(F362_OFFSET_FRAGMENT_ID, [tintBinding(1)]);
	kernelFragmentPrimitive(F362_WRONG_FRAGMENT_ID, [
		{
			name: 'scale',
			binding: 0,
			resourceKind: 'buffer',
			access: 'read',
			stages: ['fragment']
		}
	]);
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
		...(params !== undefined ? { params } : {}),
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

function pipelineGraph(fragmentPrimitiveId: string, field: GraphDocument): GraphDocument {
	const fieldOutput = field.outputs[0];
	if (!fieldOutput) {
		throw new Error('field graph needs one output');
	}
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.fullscreenPlane'),
			snapshotNode('n_persist', 'buffer.persist'),
			snapshotNode('n_vertex', 'stage.vertex'),
			snapshotNode('n_fragment', fragmentPrimitiveId),
			snapshotNode('n_display', 'target.display'),
			...field.nodes
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
				to: portRef('n_fragment', fragmentPrimitiveId, 'in', 0)
			},
			...field.edges,
			{
				id: 'e_field_fragment',
				from: fieldOutput.from,
				to: portRef('n_fragment', fragmentPrimitiveId, 'in', 1)
			},
			{
				id: 'e_fragment_display',
				from: portRef('n_fragment', fragmentPrimitiveId, 'out', 0),
				to: portRef('n_display', 'target.display', 'in', 0)
			}
		],
		outputs: [{ name: 'image', from: fieldOutput.from }]
	};
}

function constantVec4Field(value = 0.8): GraphDocument {
	const constOut = portRef('n_const', 'constant.f32', 'out', 0);
	const vec4In = (index: number) => portRef('n_vec4', 'vector.vec4f', 'in', index);
	return {
		version: '2',
		nodes: [
			snapshotNode('n_const', 'constant.f32', { value }),
			snapshotNode('n_vec4', 'vector.vec4f')
		],
		edges: [
			{ id: 'e_const_x', from: constOut, to: vec4In(0) },
			{ id: 'e_const_y', from: constOut, to: vec4In(1) },
			{ id: 'e_const_z', from: constOut, to: vec4In(2) },
			{ id: 'e_const_w', from: constOut, to: vec4In(3) }
		],
		outputs: [{ name: 'image', from: portRef('n_vec4', 'vector.vec4f', 'out', 0) }]
	};
}

function fragCoordVec4Field(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_frag', 'host.fragCoord'),
			snapshotNode('n_vec4', 'vector.combine.vec2f_f32_f32')
		],
		edges: [
			{
				id: 'e_frag_vec4',
				from: portRef('n_frag', 'host.fragCoord', 'out', 0),
				to: portRef('n_vec4', 'vector.combine.vec2f_f32_f32', 'in', 0)
			}
		],
		outputs: [{ name: 'image', from: portRef('n_vec4', 'vector.combine.vec2f_f32_f32', 'out', 0) }]
	};
}

function timeVec4Field(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_time', 'host.iTime'),
			snapshotNode('n_vec4', 'vector.vec4f')
		],
		edges: [
			{
				id: 'e_time_vec4',
				from: portRef('n_time', 'host.iTime', 'out', 0),
				to: portRef('n_vec4', 'vector.vec4f', 'in', 0)
			}
		],
		outputs: [{ name: 'image', from: portRef('n_vec4', 'vector.vec4f', 'out', 0) }]
	};
}

function channelVec4Field(): GraphDocument {
	return {
		version: '2',
		nodes: [snapshotNode('n_channel', 'input.channel', { channel: 0 })],
		edges: [],
		outputs: [{ name: 'image', from: portRef('n_channel', 'input.channel', 'out', 0) }]
	};
}

function kernelBindings(buffer?: GPUBuffer, bindingName = 'tint'): KernelFragmentBindingInput {
	return {
		wgslTypes: new Map([[bindingName, 'array<f32>']]),
		resourceIds: new Map([[bindingName, 'tint-resource']]),
		resources: buffer
			? new Map([['tint-resource', { kind: 'buffer', buffer }]])
			: new Map()
	};
}

async function executeTinted(device: GPUDevice, tint: number): Promise<Uint8Array> {
	const width = 16;
	const height = 16;
	const target = device.createTexture({
		size: { width, height },
		format: 'rgba8unorm',
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
	});
	const tintBuffer = device.createBuffer({
		label: 'kernel-fragment-test-tint',
		size: 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
	});
	try {
		device.queue.writeBuffer(tintBuffer, 0, new Float32Array([tint]));
		const result = await executeKernelFragment({
			device,
			graph: pipelineGraph(F362_FRAGMENT_ID, constantVec4Field()),
			output: { node: 'n_vec4', port: 'value' },
			bindings: [tintBinding()],
			width,
			height,
			target,
			kernelBindings: kernelBindings(tintBuffer)
		});
		return result.pixels;
	} finally {
		tintBuffer.destroy();
		target.destroy();
	}
}

describe('@world-lab/runtime-webgpu kernel fragment assembly', () => {
	registerKernelFragmentFixtures();

	it('rejects non-positive dimensions before GPU work', async () => {
		await expect(
			executeKernelFragment({
				device: {} as GPUDevice,
				graph: pipelineGraph(F362_FRAGMENT_ID, constantVec4Field()),
				output: { node: 'n_vec4', port: 'value' },
				bindings: [tintBinding()],
				width: 0,
				height: 1,
				target: {} as GPUTexture,
				kernelBindings: kernelBindings()
			})
		).rejects.toThrow('width and height must be positive');
	});

	it('rejects ShaderToy uniform host inputs and channel textures distinctly', async () => {
		const resolver = createStandardLibraryResolver();
		await expect(
			assembleKernelFragmentModuleAsync({
				graph: pipelineGraph(F362_FRAGMENT_ID, timeVec4Field()),
				output: { node: 'n_vec4', port: 'value' },
				bindings: [tintBinding()],
				wgslTypes: new Map([['tint', 'array<f32>']]),
				resolver
			})
		).rejects.toThrow('ShaderToy host uniform inputs');

		await expect(
			assembleKernelFragmentModuleAsync({
				graph: pipelineGraph(F362_FRAGMENT_ID, channelVec4Field()),
				output: { node: 'n_channel', port: 'color' },
				bindings: [tintBinding()],
				wgslTypes: new Map([['tint', 'array<f32>']]),
				resolver
			})
		).rejects.toThrow('channel textures');
	});

	it('allows host.fragCoord because it resolves through the position parameter', async () => {
		const assembly = await assembleKernelFragmentModuleAsync({
			graph: pipelineGraph(F362_FRAGMENT_ID, fragCoordVec4Field()),
			output: { node: 'n_vec4', port: 'value' },
			bindings: [tintBinding()],
			wgslTypes: new Map([['tint', 'array<f32>']]),
			resolver: createStandardLibraryResolver()
		});

		expect(assembly.code).toContain('position.xy');
		expect(assembly.code).not.toContain('var<uniform> u');
		expect(assembly.code).not.toContain('u.iTime');
		expect(assembly.code).not.toContain('u.iResolution');
	});

	it('puts graph params after the highest kernel binding index', async () => {
		const assembly = await assembleKernelFragmentModuleAsync({
			graph: pipelineGraph(F362_OFFSET_FRAGMENT_ID, constantVec4Field()),
			output: { node: 'n_vec4', port: 'value' },
			bindings: [tintBinding(1)],
			wgslTypes: new Map([['tint', 'array<f32>']]),
			resolver: createStandardLibraryResolver()
		});

		expect(assembly.paramsBindingIndex).toBe(2);
		expect(assembly.bindings).toContainEqual({
			group: 0,
			binding: 1,
			name: 'tint',
			kind: 'storage-read',
			wgslType: 'array<f32>'
		});
		expect(assembly.bindings).toContainEqual({
			group: 0,
			binding: 2,
			name: 'params',
			kind: 'uniform',
			wgslType: 'GraphParams'
		});
		expect(assembly.code).toContain('@group(0) @binding(1) var<storage, read> tint');
		expect(assembly.code).toContain('@group(0) @binding(2) var<uniform> params');
	});

	it('rejects kernel fragment bindings outside the F3.6.2 scaffold shape', async () => {
		await expect(
			assembleKernelFragmentModuleAsync({
				graph: pipelineGraph(F362_WRONG_FRAGMENT_ID, constantVec4Field()),
				output: { node: 'n_vec4', port: 'value' },
				bindings: [
					{
						name: 'scale',
						binding: 0,
						resourceKind: 'buffer',
						access: 'read',
						stages: ['fragment']
					}
				],
				wgslTypes: new Map([['scale', 'array<f32>']]),
				resolver: createStandardLibraryResolver()
			})
		).rejects.toThrow('only supports the F3.6.2 scaffold binding shape');
	});
});

describe('@world-lab/runtime-webgpu executeKernelFragment', () => {
	registerKernelFragmentFixtures();

	it.skipIf(!hasWebGPU)('uses a live tint buffer to affect rendered pixels', async () => {
		const adapter = await navigator.gpu.requestAdapter();
		expect(adapter).toBeTruthy();
		const device = await adapter!.requestDevice();
		try {
			const fullTint = await executeTinted(device, 1);
			const halfTint = await executeTinted(device, 0.5);

			expect(fullTint[0]).toBeGreaterThan(0);
			expect(halfTint[0]).toBeGreaterThanOrEqual(Math.floor(fullTint[0]! / 2) - 2);
			expect(halfTint[0]).toBeLessThanOrEqual(Math.ceil(fullTint[0]! / 2) + 2);
		} finally {
			device.destroy();
		}
	});
});
