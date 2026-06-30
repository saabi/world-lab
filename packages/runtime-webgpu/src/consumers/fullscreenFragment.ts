import { assembleStageEntry, compileGraph, type WgslModuleResolver } from '@virtual-planet/compiler';
import type { GraphDocument, PortRef, ProceduralConsumer } from '@virtual-planet/graph';

import { alignTo, rgba8BufferByteLength } from '../buffers.js';
import {
	buildParamsStructWgsl,
	emitGraphVec4Eval,
	type GraphParamField
} from '../emitGraphEval.js';
import { createStandardLibraryResolver } from '../moduleResolver.js';
import { planPipelineGraph } from '../pipelineGraph.js';
import {
	assemblePipelineVertexWgsl,
	planeGridVertexCount,
	resolvePipelineGeometryResolution
} from '../pipelineVertex.js';
import {
	packShaderToyUniforms,
	SHADERTOY_UNIFORM_BYTE_LENGTH,
	SHADERTOY_UNIFORM_STRUCT_WGSL
} from './shadertoyUniforms.js';

export interface ShaderToyHostInputs {
	iTime: number;
	iFrame?: number;
	/** Normalized pointer (xy in [0,1], zw click) — from the preview surface, not a buffer. */
	iMouse?: [number, number, number, number];
}

export interface FullscreenFragmentInput {
	device: GPUDevice;
	graph: GraphDocument;
	output: PortRef;
	resolver?: WgslModuleResolver;
	width: number;
	height: number;
	host: ShaderToyHostInputs;
}

export interface FullscreenFragmentResult {
	width: number;
	height: number;
	pixels: Uint8Array;
}

export interface FullscreenFragmentAssembly {
	code: string;
	outputName: string;
	vertexCount: number;
	params: GraphParamField[];
	/** Whether ShaderToy host uniforms are declared at `@binding(0)`. */
	usesShaderToyHost: boolean;
}

function packGraphParams(
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

async function resolveVertexAssembly(
	graph: GraphDocument,
	resolver: WgslModuleResolver
): Promise<{ vertexWgsl: string; vertexCount: number }> {
	const planeModule = await resolver.resolve('geometry.plane');
	let resU = 2;
	let resV = 2;
	try {
		const plan = planPipelineGraph(graph);
		({ resU, resV } = resolvePipelineGeometryResolution(graph, plan));
	} catch {
		// Minimal fragment-only graphs still draw via the default 2×2 plane grid.
	}
	return {
		vertexWgsl: assemblePipelineVertexWgsl(resU, resV, planeModule.source),
		vertexCount: planeGridVertexCount(resU, resV)
	};
}

function findOutputName(doc: GraphDocument, output: PortRef): string {
	const match = doc.outputs.find(
		(candidate) => candidate.from.node === output.node && candidate.from.port === output.port
	);
	if (!match) {
		throw new Error(`Output port is not declared in graph.outputs: ${output.node}.${output.port}`);
	}
	return match.name;
}

/** True when emitted WGSL reads ShaderToy host uniforms (not merely when host nodes exist on the canvas). */
export function wgslReferencesShaderToyUniform(wgsl: string): boolean {
	return /\bu\.(?:iResolution|iTime|iFrame|iMouse)\b/.test(wgsl);
}

function buildGraphEvalFn(outputName: string, body: string[], resultExpr: string): string {
	// `position` is the fragment's @builtin(position) (host.fragCoord emits `position.xy`);
	// it must be a parameter so the body resolves it. Uniform `u` is module-scope (binding).
	return `fn graph_eval_${outputName}(position: vec4f) -> vec4f {
${body.map((line) => `\t${line}`).join('\n')}
\treturn ${resultExpr};
}`;
}

export async function assembleFullscreenFragmentModuleAsync(
	graph: GraphDocument,
	output: PortRef,
	resolver: WgslModuleResolver,
	consumer: ProceduralConsumer = { type: 'image', id: 'image', stage: 'fragment', outputs: [] }
): Promise<FullscreenFragmentAssembly> {
	const outputName = findOutputName(graph, output);
	const consumerWithOutput: ProceduralConsumer = {
		...consumer,
		outputs: consumer.outputs.length > 0 ? consumer.outputs : [outputName]
	};

	const compiled = await compileGraph(graph, resolver, { consumers: [consumerWithOutput] });
	const consumerShader = compiled.shaders[0];
	if (!consumerShader) {
		throw new Error('compileGraph produced no shaders');
	}

	const emitted = emitGraphVec4Eval(graph, output, { shaderToy: true });
	const evalFn = buildGraphEvalFn(outputName, emitted.body, emitted.resultExpr);
	const libraryWithEval = `${consumerShader.code}\n\n${evalFn}`;
	const usesShaderToyHost = wgslReferencesShaderToyUniform(libraryWithEval);
	const paramsBinding = usesShaderToyHost ? 1 : 0;

	const bindings = usesShaderToyHost
		? [
				{
					group: 0,
					binding: 0,
					name: 'u',
					kind: 'uniform' as const,
					wgslType: 'ShaderToyUniforms'
				},
				{
					group: 0,
					binding: paramsBinding,
					name: 'params',
					kind: 'uniform' as const,
					wgslType: 'GraphParams'
				}
			]
		: [
				{
					group: 0,
					binding: paramsBinding,
					name: 'params',
					kind: 'uniform' as const,
					wgslType: 'GraphParams'
				}
			];

	const stage = assembleStageEntry(
		{ ...consumerShader, code: libraryWithEval },
		{
			bindings,
			outputFns: { [outputName]: `graph_eval_${outputName}` },
			callArgs: ['position']
		}
	);

	const paramsStruct = buildParamsStructWgsl(emitted.params);
	const { vertexWgsl, vertexCount } = await resolveVertexAssembly(graph, resolver);
	const codeParts = usesShaderToyHost
		? [SHADERTOY_UNIFORM_STRUCT_WGSL, paramsStruct, vertexWgsl, stage.code]
		: [paramsStruct, vertexWgsl, stage.code];
	const code = codeParts.join('\n\n');

	return { code, outputName, vertexCount, params: emitted.params, usesShaderToyHost };
}

async function createRenderPipeline(device: GPUDevice, shaderCode: string): Promise<GPURenderPipeline> {
	const module = device.createShaderModule({ label: 'fullscreen-fragment', code: shaderCode });
	return device.createRenderPipeline({
		label: 'fullscreen-fragment',
		layout: 'auto',
		vertex: { module, entryPoint: 'vs_main' },
		fragment: {
			module,
			entryPoint: 'fs_main',
			targets: [{ format: 'rgba8unorm' }]
		},
		primitive: { topology: 'triangle-list' }
	});
}

export async function executeFullscreenFragment(
	input: FullscreenFragmentInput
): Promise<FullscreenFragmentResult> {
	const { device, graph, output, width, height, host } = input;
	if (width <= 0 || height <= 0) {
		throw new RangeError('width and height must be positive');
	}

	const resolver = input.resolver ?? createStandardLibraryResolver();
	const { code, vertexCount, params, usesShaderToyHost } = await assembleFullscreenFragmentModuleAsync(
		graph,
		output,
		resolver
	);
	const pipeline = await createRenderPipeline(device, code);
	const bindGroupLayout = pipeline.getBindGroupLayout(0);

	const bindGroupEntries: GPUBindGroupEntry[] = [];
	let uniformBuffer: GPUBuffer | null = null;
	let graphParamsBuffer: GPUBuffer | null = null;

	if (usesShaderToyHost) {
		const uniformData = packShaderToyUniforms({
			width,
			height,
			iTime: host.iTime,
			iMouse: host.iMouse,
			iFrame: host.iFrame
		});
		uniformBuffer = device.createBuffer({
			label: 'shadertoy-uniforms',
			size: alignTo(SHADERTOY_UNIFORM_BYTE_LENGTH, 16),
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(uniformBuffer, 0, uniformData);
		bindGroupEntries.push({ binding: 0, resource: { buffer: uniformBuffer } });
	}

	const graphParamsData = packGraphParams(width, height, params, graph);
	graphParamsBuffer = device.createBuffer({
		label: 'fullscreen-fragment-graph-params',
		size: alignTo(graphParamsData.byteLength, 16),
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(
		graphParamsBuffer,
		0,
		graphParamsData.buffer,
		graphParamsData.byteOffset,
		graphParamsData.byteLength
	);
	bindGroupEntries.push({
		binding: usesShaderToyHost ? 1 : 0,
		resource: { buffer: graphParamsBuffer }
	});

	const bindGroup = device.createBindGroup({
		layout: bindGroupLayout,
		entries: bindGroupEntries
	});

	const texture = device.createTexture({
		label: 'fullscreen-fragment-target',
		size: { width, height },
		format: 'rgba8unorm',
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
	});

	const encoder = device.createCommandEncoder({ label: 'fullscreen-fragment' });
	const pass = encoder.beginRenderPass({
		label: 'fullscreen-fragment',
		colorAttachments: [
			{
				view: texture.createView(),
				loadOp: 'clear',
				storeOp: 'store',
				clearValue: { r: 0, g: 0, b: 0, a: 1 }
			}
		]
	});
	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.draw(vertexCount);
	pass.end();

	const pixelBytes = rgba8BufferByteLength(width, height);
	const bytesPerRow = alignTo(width * 4, 256);
	const paddedBytes = bytesPerRow * height;
	const readbackBuffer = device.createBuffer({
		label: 'fullscreen-fragment-readback',
		size: paddedBytes,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	});
	encoder.copyTextureToBuffer(
		{ texture },
		{ buffer: readbackBuffer, bytesPerRow, rowsPerImage: height },
		{ width, height }
	);
	device.queue.submit([encoder.finish()]);

	await readbackBuffer.mapAsync(GPUMapMode.READ);
	const mapped = new Uint8Array(readbackBuffer.getMappedRange());
	const pixels = new Uint8Array(pixelBytes);
	const rowBytes = width * 4;
	for (let y = 0; y < height; y++) {
		pixels.set(mapped.subarray(y * bytesPerRow, y * bytesPerRow + rowBytes), y * rowBytes);
	}
	readbackBuffer.unmap();

	uniformBuffer?.destroy();
	graphParamsBuffer?.destroy();
	texture.destroy();
	readbackBuffer.destroy();

	return { width, height, pixels };
}
