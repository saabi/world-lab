import {
	getPrimitive,
	paramInputPorts,
	type GraphDocument,
	type Node,
	type Port,
	type PortSpec
} from '@world-lab/graph';
import { assertVaryingsMatch } from '@world-lab/compiler';
import { describe, expect, it } from 'vitest';

import { alignTo, rgba8BufferByteLength } from './buffers.js';
import { assembleKernelFragmentModuleAsync } from './consumers/kernelFragment.js';
import { createStandardLibraryResolver } from './moduleResolver.js';
import { assembleVertexKernelPositionModuleAsync } from './vertexKernelPosition.js';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		...(spec.type !== undefined ? { type: spec.type } : {}),
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
		inputs: [
			...instantiatePorts(primitive.inputs, 'in'),
			...instantiatePorts(paramInputPorts(primitive), 'in')
		],
		outputs: instantiatePorts(primitive.outputs, 'out'),
		...(params !== undefined ? { params } : {})
	};
}

async function expectVertexModuleLinks(graph: GraphDocument, output = { node: 'n_pos', port: 'position' }): Promise<string> {
	const { requestGpuDevice } = await import('./device.js');
	const assembly = await assembleVertexKernelPositionModuleAsync({
		graph,
		output,
		resolver: createStandardLibraryResolver()
	});

	expect(assembly.vertexCount).toBe(6);
	expect(assembly.code).toContain('fn plane_grid_position');
	expect(assembly.code).toContain('plane_grid_position(vid, 2u, 2u, 2.0, 2.0, 0.0, 0.0, 0.0)');
	expect(assembly.code).toContain('return vec4f(');
	expect(assembly.code).toContain(', 1.0);');

	const { device } = await requestGpuDevice();
	try {
		const vertexModule = device.createShaderModule({ code: assembly.code });
		const vertexInfo = await vertexModule.getCompilationInfo();
		expect(vertexInfo.messages.filter((message) => message.type === 'error')).toEqual([]);

		const fragmentModule = device.createShaderModule({
			code: `@fragment
fn fs_main() -> @location(0) vec4f {
	return vec4f(1.0);
}`
		});
		const fragmentInfo = await fragmentModule.getCompilationInfo();
		expect(fragmentInfo.messages.filter((message) => message.type === 'error')).toEqual([]);

		const pipeline = await device.createRenderPipelineAsync({
			label: 'vertex-kernel-position-device-compile',
			layout: 'auto',
			vertex: { module: vertexModule, entryPoint: 'vs_main' },
			fragment: {
				module: fragmentModule,
				entryPoint: 'fs_main',
				targets: [{ format: 'rgba8unorm' }]
			},
			primitive: { topology: 'triangle-list' }
		});
		expect(pipeline).toBeDefined();
	} finally {
		device.destroy();
	}

	return assembly.code;
}

function vertexVaryingGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_pos', 'procedural.metricPosition'),
			snapshotNode('n_x', 'vector.vec3f.x'),
			snapshotNode('n_y', 'vector.vec3f.y'),
			snapshotNode('n_uv', 'vector.vec2f')
		],
		edges: [
			{ id: 'e_pos_x', from: { node: 'n_pos', port: 'position' }, to: { node: 'n_x', port: 'value' } },
			{ id: 'e_pos_y', from: { node: 'n_pos', port: 'position' }, to: { node: 'n_y', port: 'value' } },
			{ id: 'e_x_uv', from: { node: 'n_x', port: 'x' }, to: { node: 'n_uv', port: 'x' } },
			{ id: 'e_y_uv', from: { node: 'n_y', port: 'y' }, to: { node: 'n_uv', port: 'y' } }
		],
		outputs: [
			{ name: 'position', from: { node: 'n_pos', port: 'position' } },
			{ name: 'uv', from: { node: 'n_uv', port: 'value' } }
		]
	};
}

function fragmentUvGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv'),
			snapshotNode('n_color', 'vector.combine.vec2f_f32_f32')
		],
		edges: [
			{ id: 'e_uv_color', from: { node: 'n_uv', port: 'uv' }, to: { node: 'n_color', port: 'xy' } }
		],
		outputs: [{ name: 'color', from: { node: 'n_color', port: 'value' } }]
	};
}

async function assemblePairedVaryingPipeline(): Promise<{
	code: string;
	vertexCount: number;
}> {
	const resolver = createStandardLibraryResolver();
	const vertex = await assembleVertexKernelPositionModuleAsync({
		graph: vertexVaryingGraph(),
		output: { node: 'n_pos', port: 'position' },
		uvOutput: { node: 'n_uv', port: 'value' },
		resolver
	});
	const fragment = await assembleKernelFragmentModuleAsync({
		graph: fragmentUvGraph(),
		output: { node: 'n_color', port: 'value' },
		bindings: [],
		wgslTypes: new Map(),
		resolver,
		varyings: vertex.varyings
	});

	assertVaryingsMatch(vertex.varyings, [{ name: 'uv', wgslType: 'vec2f' }]);
	expect(fragment.vertexCount).toBe(0);
	return { code: `${vertex.code}\n\n${fragment.code}`, vertexCount: vertex.vertexCount };
}

async function renderPairedVaryingPipeline(width: number, height: number): Promise<Uint8Array> {
	const { requestGpuDevice } = await import('./device.js');
	const { device } = await requestGpuDevice();
	try {
		const { code, vertexCount } = await assemblePairedVaryingPipeline();
		const module = device.createShaderModule({ code });
		const info = await module.getCompilationInfo();
		expect(info.messages.filter((message) => message.type === 'error')).toEqual([]);
		const pipeline = await device.createRenderPipelineAsync({
			label: 'vertex-fragment-varying-pipeline',
			layout: 'auto',
			vertex: { module, entryPoint: 'vs_main' },
			fragment: {
				module,
				entryPoint: 'fs_main',
				targets: [{ format: 'rgba8unorm' }]
			},
			primitive: { topology: 'triangle-list' }
		});

		const target = device.createTexture({
			label: 'vertex-fragment-varying-target',
			size: { width, height },
			format: 'rgba8unorm',
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
		});
		const encoder = device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: target.createView(),
					loadOp: 'clear',
					storeOp: 'store',
					clearValue: { r: 0, g: 0, b: 0, a: 1 }
				}
			]
		});
		pass.setPipeline(pipeline);
		pass.draw(vertexCount);
		pass.end();

		const bytesPerRow = alignTo(width * 4, 256);
		const readback = device.createBuffer({
			size: bytesPerRow * height,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
		});
		encoder.copyTextureToBuffer(
			{ texture: target },
			{ buffer: readback, bytesPerRow, rowsPerImage: height },
			{ width, height }
		);
		device.queue.submit([encoder.finish()]);

		await readback.mapAsync(GPUMapMode.READ);
		const mapped = new Uint8Array(readback.getMappedRange());
		const pixels = new Uint8Array(rgba8BufferByteLength(width, height));
		for (let y = 0; y < height; y++) {
			pixels.set(mapped.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
		}
		readback.unmap();
		readback.destroy();
		target.destroy();
		return pixels;
	} finally {
		device.destroy();
	}
}

describe('@world-lab/runtime-webgpu vertex kernel position assembly', () => {
	it.skipIf(!hasWebGPU)('assembles metricPosition passthrough into linkable vertex WGSL', async () => {
		const graph: GraphDocument = {
			version: '2',
			nodes: [snapshotNode('n_pos', 'procedural.metricPosition')],
			edges: [],
			outputs: [{ name: 'position', from: { node: 'n_pos', port: 'position' } }]
		};

		const code = await expectVertexModuleLinks(graph);
		expect(code).toContain('let v_n_pos_position: vec3<f32> = plane_grid_position(');
		expect(code).toContain('vec4f(v_n_pos_position, 1.0)');
	});

	it.skipIf(!hasWebGPU)('assembles graph-authored position math into linkable vertex WGSL', async () => {
		const graph: GraphDocument = {
			version: '2',
			nodes: [
				snapshotNode('n_pos', 'procedural.metricPosition'),
				snapshotNode('n_x', 'constant.f32', { value: 0.1 }),
				snapshotNode('n_y', 'constant.f32', { value: 0 }),
				snapshotNode('n_z', 'constant.f32', { value: 0 }),
				snapshotNode('n_offset', 'vector.vec3f'),
				snapshotNode('n_translate', 'transform.translate')
			],
			edges: [
				{ id: 'e_pos_translate', from: { node: 'n_pos', port: 'position' }, to: { node: 'n_translate', port: 'position' } },
				{ id: 'e_x_offset', from: { node: 'n_x', port: 'value' }, to: { node: 'n_offset', port: 'x' } },
				{ id: 'e_y_offset', from: { node: 'n_y', port: 'value' }, to: { node: 'n_offset', port: 'y' } },
				{ id: 'e_z_offset', from: { node: 'n_z', port: 'value' }, to: { node: 'n_offset', port: 'z' } },
				{ id: 'e_offset_translate', from: { node: 'n_offset', port: 'value' }, to: { node: 'n_translate', port: 'offset' } }
			],
			outputs: [{ name: 'position', from: { node: 'n_translate', port: 'position' } }]
		};

		const code = await expectVertexModuleLinks(graph, { node: 'n_translate', port: 'position' });
		expect(code).toContain('fn makeVec3f(');
		expect(code).toContain('fn translate(');
		expect(code).toContain('vec4f(v_n_translate_position, 1.0)');
	});

	it.skipIf(!hasWebGPU)('assembles a real uv varying from graph-authored vertex output', async () => {
		const { requestGpuDevice } = await import('./device.js');
		const { code } = await assemblePairedVaryingPipeline();
		expect(code).toContain('@location(0) uv: vec2f');
		expect(code).toContain('fn graph_eval_uv(vid: u32, iid: u32) -> vec2f');
		expect(code).toContain('fn fs_main(input: VSOut)');
		expect(code).not.toMatch(/struct VSOut[\s\S]*struct VSOut/);

		const { device } = await requestGpuDevice();
		try {
			const module = device.createShaderModule({ code });
			const info = await module.getCompilationInfo();
			expect(info.messages.filter((message) => message.type === 'error')).toEqual([]);
			const pipeline = await device.createRenderPipelineAsync({
				label: 'vertex-fragment-varying-link',
				layout: 'auto',
				vertex: { module, entryPoint: 'vs_main' },
				fragment: {
					module,
					entryPoint: 'fs_main',
					targets: [{ format: 'rgba8unorm' }]
				},
				primitive: { topology: 'triangle-list' }
			});
			expect(pipeline).toBeDefined();
		} finally {
			device.destroy();
		}
	});

	it.skipIf(!hasWebGPU)('renders a non-uniform image from the interpolated uv varying', async () => {
		const pixels = await renderPairedVaryingPipeline(8, 8);
		const first = pixels.slice(0, 4).join(',');
		const unique = new Set<string>();
		for (let i = 0; i < pixels.length; i += 4) {
			unique.add(pixels.slice(i, i + 4).join(','));
		}
		expect(unique.size).toBeGreaterThan(1);
		expect([...unique]).toContain(first);
	});

	it('uses assertVaryingsMatch as a load-bearing compatibility check', async () => {
		const vertex = await assembleVertexKernelPositionModuleAsync({
			graph: vertexVaryingGraph(),
			output: { node: 'n_pos', port: 'position' },
			uvOutput: { node: 'n_uv', port: 'value' },
			resolver: createStandardLibraryResolver()
		});

		expect(() => assertVaryingsMatch(vertex.varyings, [{ name: 'uv', wgslType: 'vec2f' }])).not.toThrow();
		expect(() => assertVaryingsMatch(vertex.varyings, [{ name: 'color', wgslType: 'vec2f' }])).toThrow();
		expect(() => assertVaryingsMatch(vertex.varyings, [{ name: 'uv', wgslType: 'vec3f' }])).toThrow();
	});
});
