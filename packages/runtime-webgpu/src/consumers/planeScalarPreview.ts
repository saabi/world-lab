import { generateWgsl, sliceGraph } from '@virtual-planet/compiler';
import type { GraphDocument, PortRef } from '@virtual-planet/graph';

import {
	alignTo,
	createStorageBuffer,
	rgba8BufferByteLength
} from '../buffers.js';
import {
	buildParamsStructWgsl,
	emitGraphScalarEval,
	type GraphParamField
} from '../emitGraphEval.js';
import { createStandardLibraryResolver } from '../moduleResolver.js';
import type { ConsumerExecuteInput, ScalarFieldResult } from '../types.js';

function findOutputName(doc: GraphDocument, output: PortRef): string {
	const match = doc.outputs.find(
		(candidate) => candidate.from.node === output.node && candidate.from.port === output.port
	);
	if (!match) {
		throw new Error(`Output port is not declared in graph.outputs: ${output.node}.${output.port}`);
	}
	return match.name;
}

function packParams(
	width: number,
	height: number,
	fields: GraphParamField[],
	doc: GraphDocument
): Float32Array {
	const values = [width, height];
	for (const field of fields) {
		const node = doc.nodes.find((candidate) => candidate.id === field.nodeId);
		if (!node) {
			values.push(field.defaultValue);
			continue;
		}
		const params = node.params ?? {};
		const value = params[field.paramName];
		values.push(typeof value === 'number' ? value : field.defaultValue);
	}
	return new Float32Array(values);
}

function buildComputeShader(moduleCode: string, evalBody: string[], resultExpr: string, params: GraphParamField[]): string {
	const paramsStruct = buildParamsStructWgsl(params);
	return `${moduleCode}

${paramsStruct}

@group(0) @binding(0) var<uniform> params: GraphParams;
@group(0) @binding(1) var<storage, read_write> out_pixels: array<u32>;

fn evaluate(u: f32, v: f32) -> f32 {
${evalBody.map((line) => `\t${line}`).join('\n')}
\treturn ${resultExpr};
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let width = u32(params.width);
	let height = u32(params.height);
	if (gid.x >= width || gid.y >= height) {
		return;
	}

	let u = f32(gid.x) / f32(max(1u, width - 1u));
	let v = f32(gid.y) / f32(max(1u, height - 1u));
	let scalar = clamp(evaluate(u, v), 0.0, 1.0);
	let byte = u32(scalar * 255.0);
	let rgba = byte | (byte << 8u) | (byte << 16u) | (0xffu << 24u);
	out_pixels[gid.y * width + gid.x] = rgba;
}
`;
}

async function createComputePipeline(device: GPUDevice, shaderCode: string): Promise<GPUComputePipeline> {
	const module = device.createShaderModule({ label: 'plane-scalar-preview', code: shaderCode });
	return device.createComputePipeline({
		label: 'plane-scalar-preview',
		layout: 'auto',
		compute: { module, entryPoint: 'main' }
	});
}

export async function executePlaneScalarPreview(
	input: ConsumerExecuteInput
): Promise<ScalarFieldResult> {
	const { device, graph, output, width, height } = input;
	if (width <= 0 || height <= 0) {
		throw new RangeError('width and height must be positive');
	}

	const outputName = findOutputName(graph, output);
	const slice = sliceGraph(graph, { outputs: [outputName] });
	const generated = await generateWgsl(slice, createStandardLibraryResolver());
	const emitted = emitGraphScalarEval(graph, output);
	const shaderCode = buildComputeShader(generated.code, emitted.body, emitted.resultExpr, emitted.params);

	const pipeline = await createComputePipeline(device, shaderCode);
	const bindGroupLayout = pipeline.getBindGroupLayout(0);

	const uniformData = packParams(width, height, emitted.params, graph);
	const uniformBuffer = device.createBuffer({
		label: 'plane-scalar-preview-uniforms',
		size: alignTo(uniformData.byteLength, 16),
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer, uniformData.byteOffset, uniformData.byteLength);

	const pixelBytes = rgba8BufferByteLength(width, height);
	const storageBuffer = createStorageBuffer(device, {
		label: 'plane-scalar-preview-pixels',
		size: pixelBytes,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
	});

	const bindGroup = device.createBindGroup({
		layout: bindGroupLayout,
		entries: [
			{ binding: 0, resource: { buffer: uniformBuffer } },
			{ binding: 1, resource: { buffer: storageBuffer } }
		]
	});

	const encoder = device.createCommandEncoder({ label: 'plane-scalar-preview' });
	const pass = encoder.beginComputePass({ label: 'plane-scalar-preview' });
	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
	pass.end();

	const readbackBuffer = device.createBuffer({
		label: 'plane-scalar-preview-readback',
		size: pixelBytes,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	});
	encoder.copyBufferToBuffer(storageBuffer, 0, readbackBuffer, 0, pixelBytes);
	device.queue.submit([encoder.finish()]);

	await readbackBuffer.mapAsync(GPUMapMode.READ);
	const mapped = new Uint8Array(readbackBuffer.getMappedRange()).slice();
	readbackBuffer.unmap();

	uniformBuffer.destroy();
	storageBuffer.destroy();
	readbackBuffer.destroy();

	return {
		width,
		height,
		pixels: mapped
	};
}
