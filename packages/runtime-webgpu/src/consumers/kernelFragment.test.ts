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

import { assembleFullscreenFragmentModuleAsync } from './fullscreenFragment.js';
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
const F362_SCALE_FRAGMENT_ID = 'test.f362KernelFragmentStageScaleBinding';

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
			description: 'F3.6 test-only kernel-based fragment stage fixture.',
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

function scaleBinding(): KernelBindingTemplate {
	return {
		name: 'scale',
		binding: 0,
		resourceKind: 'buffer',
		access: 'read',
		stages: ['fragment']
	};
}

function registerKernelFragmentFixtures(): void {
	kernelFragmentPrimitive(F362_FRAGMENT_ID, [tintBinding()]);
	kernelFragmentPrimitive(F362_OFFSET_FRAGMENT_ID, [tintBinding(1)]);
	kernelFragmentPrimitive(F362_SCALE_FRAGMENT_ID, [scaleBinding()]);
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
		outputs: [
			{ name: 'image', from: portRef('n_vec4', 'vector.combine.vec2f_f32_f32', 'out', 0) }
		]
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

function varyingUvVec4Field(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv'),
			snapshotNode('n_vec4', 'vector.combine.vec2f_f32_f32')
		],
		edges: [
			{
				id: 'e_uv_vec4',
				from: portRef('n_uv', 'procedural.uv', 'out', 0),
				to: portRef('n_vec4', 'vector.combine.vec2f_f32_f32', 'in', 0)
			}
		],
		outputs: [
			{ name: 'image', from: portRef('n_vec4', 'vector.combine.vec2f_f32_f32', 'out', 0) }
		]
	};
}

function timeParamChannelField(): GraphDocument {
	const constOut = portRef('n_const', 'constant.f32', 'out', 0);
	return {
		version: '2',
		nodes: [
			snapshotNode('n_time', 'host.iTime'),
			snapshotNode('n_const', 'constant.f32', { value: 0.25 }),
			snapshotNode('n_vec4', 'vector.vec4f'),
			snapshotNode('n_channel', 'input.channel', { channel: 0 }),
			snapshotNode('n_add', 'vector.add.vec4f')
		],
		edges: [
			{
				id: 'e_time_vec4',
				from: portRef('n_time', 'host.iTime', 'out', 0),
				to: portRef('n_vec4', 'vector.vec4f', 'in', 0)
			},
			{ id: 'e_const_y', from: constOut, to: portRef('n_vec4', 'vector.vec4f', 'in', 1) },
			{ id: 'e_const_z', from: constOut, to: portRef('n_vec4', 'vector.vec4f', 'in', 2) },
			{ id: 'e_const_w', from: constOut, to: portRef('n_vec4', 'vector.vec4f', 'in', 3) },
			{
				id: 'e_channel_add',
				from: portRef('n_channel', 'input.channel', 'out', 0),
				to: portRef('n_add', 'vector.add.vec4f', 'in', 0)
			},
			{
				id: 'e_vec4_add',
				from: portRef('n_vec4', 'vector.vec4f', 'out', 0),
				to: portRef('n_add', 'vector.add.vec4f', 'in', 1)
			}
		],
		outputs: [{ name: 'image', from: portRef('n_add', 'vector.add.vec4f', 'out', 0) }]
	};
}

function kernelBindings(buffer?: GPUBuffer, bindingName = 'tint'): KernelFragmentBindingInput {
	return {
		wgslTypes: new Map([[bindingName, 'array<f32>']]),
		resourceIds: new Map([[bindingName, `${bindingName}-resource`]]),
		resources: buffer
			? new Map([[`${bindingName}-resource`, { kind: 'buffer', buffer }]])
			: new Map()
	};
}

function emptyKernelBindings(): KernelFragmentBindingInput {
	return { wgslTypes: new Map(), resourceIds: new Map(), resources: new Map() };
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
				host: { iTime: 0 },
				target: {} as GPUTexture,
				kernelBindings: kernelBindings()
			})
		).rejects.toThrow('width and height must be positive');
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

	it('accepts non-tint kernel-declared bindings after removing the F3.6.2 scaffold gate', async () => {
		const assembly = await assembleKernelFragmentModuleAsync({
			graph: pipelineGraph(F362_SCALE_FRAGMENT_ID, constantVec4Field()),
			output: { node: 'n_vec4', port: 'value' },
			bindings: [scaleBinding()],
			wgslTypes: new Map([['scale', 'array<f32>']]),
			resolver: createStandardLibraryResolver()
		});

		expect(assembly.bindings).toContainEqual({
			group: 0,
			binding: 0,
			name: 'scale',
			kind: 'storage-read',
			wgslType: 'array<f32>'
		});
		expect(assembly.code).toContain('@group(0) @binding(0) var<storage, read> scale');
		expect(assembly.code).not.toContain('tint[0]');
	});

	it('still rejects malformed kernel-declared bindings', async () => {
		await expect(
			assembleKernelFragmentModuleAsync({
				graph: pipelineGraph(F362_FRAGMENT_ID, constantVec4Field()),
				output: { node: 'n_vec4', port: 'value' },
				bindings: [
					{
						name: 'badTexture',
						binding: 0,
						resourceKind: 'texture',
						access: 'write',
						stages: ['fragment']
					}
				],
				wgslTypes: new Map([['badTexture', 'texture_2d<f32>']]),
				resolver: createStandardLibraryResolver()
			})
		).rejects.toThrow("texture kernel bindings must declare access:'read'");
	});

	it('derives ShaderToy host uniform bindings for host.iTime', async () => {
		const assembly = await assembleKernelFragmentModuleAsync({
			graph: pipelineGraph('stage.fragmentKernel', timeVec4Field()),
			output: { node: 'n_vec4', port: 'value' },
			bindings: [],
			wgslTypes: new Map(),
			resolver: createStandardLibraryResolver()
		});

		expect(assembly.usesShaderToyHost).toBe(true);
		expect(assembly.bindings).toContainEqual({
			group: 0,
			binding: 0,
			name: 'u',
			kind: 'uniform',
			wgslType: 'ShaderToyUniforms'
		});
		expect(assembly.code).toContain('struct ShaderToyUniforms');
		expect(assembly.code).toContain('u.iTime');
	});

	it('shares channel binding derivation with the fullscreen fragment path', async () => {
		const graph = pipelineGraph('stage.fragmentKernel', channelVec4Field());
		const kernelAssembly = await assembleKernelFragmentModuleAsync({
			graph,
			output: { node: 'n_channel', port: 'color' },
			bindings: [],
			wgslTypes: new Map(),
			resolver: createStandardLibraryResolver()
		});
		const fullscreenAssembly = await assembleFullscreenFragmentModuleAsync(
			graph,
			{ node: 'n_channel', port: 'color' },
			createStandardLibraryResolver()
		);

		expect([...kernelAssembly.channelBindings]).toEqual([...fullscreenAssembly.channelBindings]);
		const channelBindings = [...kernelAssembly.channelBindings.values()][0]!;
		expect(kernelAssembly.bindings).toContainEqual({
			group: 0,
			binding: channelBindings.textureBinding,
			name: 'channel0',
			kind: 'texture',
			wgslType: 'texture_2d<f32>'
		});
		expect(kernelAssembly.bindings).toContainEqual({
			group: 0,
			binding: channelBindings.samplerBinding,
			name: 'channel0Sampler',
			kind: 'sampler',
			wgslType: 'sampler'
		});
	});

	it('orders kernel-declared, uniform, params, and channel bindings without collisions', async () => {
		const assembly = await assembleKernelFragmentModuleAsync({
			graph: pipelineGraph(F362_FRAGMENT_ID, timeParamChannelField()),
			output: { node: 'n_add', port: 'value' },
			bindings: [tintBinding()],
			wgslTypes: new Map([['tint', 'array<f32>']]),
			resolver: createStandardLibraryResolver()
		});

		expect(assembly.paramsBindingIndex).toBe(2);
		expect([...assembly.channelBindings]).toEqual([
			[0, { textureBinding: 3, samplerBinding: 4 }]
		]);
		for (const [name, binding, kind] of [
			['tint', 0, 'storage-read'],
			['u', 1, 'uniform'],
			['params', 2, 'uniform'],
			['channel0', 3, 'texture'],
			['channel0Sampler', 4, 'sampler']
		] as const) {
			expect(assembly.bindings).toContainEqual(
				expect.objectContaining({ name, binding, kind })
			);
			expect(assembly.code).toContain(`@group(0) @binding(${binding})`);
		}
	});
});

describe('@world-lab/runtime-webgpu executeKernelFragment', () => {
	registerKernelFragmentFixtures();

	it.skipIf(!hasWebGPU)('samples a live channel texture through stage.fragmentKernel', async () => {
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
		const channel = device.createTexture({
			size: { width, height },
			format: 'rgba8unorm',
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
		});
		const expected = [51, 128, 204, 255];
		try {
			const row = new Uint8Array(width * 4);
			for (let x = 0; x < width; x++) {
				row.set(expected, x * 4);
			}
			const data = new Uint8Array(width * height * 4);
			for (let y = 0; y < height; y++) {
				data.set(row, y * row.length);
			}
			device.queue.writeTexture(
				{ texture: channel },
				data,
				{ bytesPerRow: width * 4, rowsPerImage: height },
				{ width, height }
			);

			const result = await executeKernelFragment({
				device,
				graph: pipelineGraph('stage.fragmentKernel', channelVec4Field()),
				output: { node: 'n_channel', port: 'color' },
				bindings: [],
				width,
				height,
				host: { iTime: 0 },
				target,
				kernelBindings: emptyKernelBindings(),
				channelTargets: new Map([[0, channel]])
			});

			const actual = [
				result.pixels[0]!,
				result.pixels[1]!,
				result.pixels[2]!,
				result.pixels[3]!
			];
			for (let i = 0; i < expected.length; i++) {
				expect(actual[i]).toBeGreaterThanOrEqual(expected[i]! - 3);
				expect(actual[i]).toBeLessThanOrEqual(expected[i]! + 3);
			}
		} finally {
			target.destroy();
			channel.destroy();
			device.destroy();
		}
	});

	it.skipIf(!hasWebGPU)('throws when a referenced channel target is missing', async () => {
		const adapter = await navigator.gpu.requestAdapter();
		expect(adapter).toBeTruthy();
		const device = await adapter!.requestDevice();
		const target = device.createTexture({
			size: { width: 4, height: 4 },
			format: 'rgba8unorm',
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
		});
		try {
			await expect(
				executeKernelFragment({
					device,
					graph: pipelineGraph('stage.fragmentKernel', channelVec4Field()),
					output: { node: 'n_channel', port: 'color' },
					bindings: [],
					width: 4,
					height: 4,
					host: { iTime: 0 },
					target,
					kernelBindings: emptyKernelBindings()
				})
			).rejects.toThrow('Missing channel target for channel 0');
		} finally {
			target.destroy();
			device.destroy();
		}
	});

	it.skipIf(!hasWebGPU)('draws with a supplied vertex module when fragment assembly is varying-only', async () => {
		const adapter = await navigator.gpu.requestAdapter();
		expect(adapter).toBeTruthy();
		const device = await adapter!.requestDevice();
		const width = 8;
		const height = 8;
		const target = device.createTexture({
			size: { width, height },
			format: 'rgba8unorm',
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
		});
		const vertexModule = `struct VSOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
	var positions = array<vec2f, 6>(
		vec2f(-1.0, -1.0),
		vec2f(1.0, -1.0),
		vec2f(-1.0, 1.0),
		vec2f(-1.0, 1.0),
		vec2f(1.0, -1.0),
		vec2f(1.0, 1.0)
	);
	var out: VSOut;
	let p = positions[vid];
	out.position = vec4f(p, 0.0, 1.0);
	out.uv = p * 0.5 + vec2f(0.5, 0.5);
	return out;
}`;
		try {
			const result = await executeKernelFragment({
				device,
				graph: pipelineGraph('stage.fragmentKernel', varyingUvVec4Field()),
				output: { node: 'n_vec4', port: 'value' },
				bindings: [],
				width,
				height,
				host: { iTime: 0 },
				target,
				kernelBindings: emptyKernelBindings(),
				varyings: [{ name: 'uv', wgslType: 'vec2f' }],
				vertexModule: { code: vertexModule, vertexCount: 6 }
			});
			const unique = new Set<string>();
			for (let i = 0; i < result.pixels.length; i += 4) {
				unique.add(result.pixels.slice(i, i + 4).join(','));
			}
			expect(unique.size).toBeGreaterThan(1);
			expect(unique).not.toEqual(new Set(['0,0,0,255']));
		} finally {
			target.destroy();
			device.destroy();
		}
	});
});
