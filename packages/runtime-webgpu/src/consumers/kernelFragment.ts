import {
	assembleStageEntry,
	compileGraph,
	type BindingDecl,
	type WgslModuleResolver
} from '@world-lab/compiler';
import {
	resolveKernelBindings,
	type GraphDocument,
	type KernelBindingTemplate,
	type PortRef
} from '@world-lab/graph';

import { alignTo, rgba8BufferByteLength } from '../buffers.js';
import {
	buildComputeBindGroupEntries,
	buildKernelBindingDecls,
	type ComputeKernelResource
} from '../computeKernel.js';
import {
	buildParamsStructWgsl,
	emitGraphVec4Eval,
	type GraphParamField
} from '../emitGraphEval.js';
import { createStandardLibraryResolver } from '../moduleResolver.js';
import {
	packGraphParams,
	resolveVertexAssembly,
	wgslReferencesShaderToyUniform,
	type FullscreenFragmentResult
} from './fullscreenFragment.js';

export interface KernelFragmentBindingInput {
	/** Binding name -> concrete WGSL type string. */
	wgslTypes: ReadonlyMap<string, string>;
	/** Binding name -> resourceId. */
	resourceIds: ReadonlyMap<string, string>;
	/** resourceId -> the real, already-allocated GPU resource. */
	resources: ReadonlyMap<string, ComputeKernelResource>;
}

export interface KernelFragmentInput {
	device: GPUDevice;
	graph: GraphDocument;
	/** The field-color port wired into the kernel fragment stage's `color` input. */
	output: PortRef;
	bindings: readonly KernelBindingTemplate[];
	resolver?: WgslModuleResolver;
	width: number;
	height: number;
	target: GPUTexture;
	kernelBindings: KernelFragmentBindingInput;
}

export interface KernelFragmentAssemblyInput {
	graph: GraphDocument;
	output: PortRef;
	bindings: readonly KernelBindingTemplate[];
	wgslTypes: ReadonlyMap<string, string>;
	resolver?: WgslModuleResolver;
}

export interface KernelFragmentAssembly {
	code: string;
	outputName: string;
	vertexCount: number;
	params: GraphParamField[];
	bindings: BindingDecl[];
	paramsBindingIndex: number;
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

function buildKernelGraphEvalFn(outputName: string, body: string[], resultExpr: string): string {
	return `fn graph_eval_${outputName}(position: vec4f) -> vec4f {
${body.map((line) => `\t${line}`).join('\n')}
\treturn ${resultExpr} * tint[0];
}`;
}

function assertSupportedKernelFragmentShape(bindings: readonly KernelBindingTemplate[]): void {
	const tint = bindings.length === 1 ? bindings[0] : undefined;
	const matches =
		tint !== undefined &&
		tint.name === 'tint' &&
		tint.resourceKind === 'buffer' &&
		tint.access === 'read' &&
		tint.stages.includes('fragment');
	if (!matches) {
		throw new Error(
			'executeKernelFragment only supports the F3.6.2 scaffold binding shape (exactly one ' +
				'read-only buffer binding named "tint")'
		);
	}
}

function nextFreeBindingIndex(bindings: readonly KernelBindingTemplate[]): number {
	return bindings.reduce((max, binding) => Math.max(max, binding.binding), -1) + 1;
}

async function createKernelFragmentPipeline(
	device: GPUDevice,
	shaderCode: string
): Promise<GPURenderPipeline> {
	const module = device.createShaderModule({ label: 'kernel-fragment', code: shaderCode });
	return device.createRenderPipeline({
		label: 'kernel-fragment',
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

export async function assembleKernelFragmentModuleAsync(
	input: KernelFragmentAssemblyInput
): Promise<KernelFragmentAssembly> {
	const { graph, output, bindings, wgslTypes } = input;
	assertSupportedKernelFragmentShape(bindings);

	const resolver = input.resolver ?? createStandardLibraryResolver();
	const outputName = findOutputName(graph, output);
	const compiled = await compileGraph(graph, resolver, {
		consumers: [
			{ type: 'image', id: 'kernel-fragment', stage: 'fragment', outputs: [outputName] }
		]
	});
	const consumerShader = compiled.shaders[0];
	if (!consumerShader) {
		throw new Error('compileGraph produced no shaders');
	}

	const emitted = emitGraphVec4Eval(graph, output, { shaderToy: false });
	const evalFn = buildKernelGraphEvalFn(outputName, emitted.body, emitted.resultExpr);
	const libraryWithEval = `${consumerShader.code}\n\n${evalFn}`;
	if (wgslReferencesShaderToyUniform(libraryWithEval)) {
		throw new Error(
			'Kernel-based fragment stages do not yet support ShaderToy host uniform inputs ' +
				'(host.iResolution/host.iTime/host.iMouse)'
		);
	}
	if (emitted.usedChannels.length > 0) {
		throw new Error(
			'Kernel-based fragment stages do not yet support channel textures (input.channel)'
		);
	}

	const kernelBindingDecls = buildKernelBindingDecls(bindings, wgslTypes);
	const hasGraphParams = emitted.params.length > 0;
	const paramsBindingIndex = nextFreeBindingIndex(bindings);
	const allBindings: BindingDecl[] = [...kernelBindingDecls];
	if (hasGraphParams) {
		allBindings.push({
			group: 0,
			binding: paramsBindingIndex,
			name: 'params',
			kind: 'uniform',
			wgslType: 'GraphParams'
		});
	}

	const stage = assembleStageEntry(
		{ ...consumerShader, code: libraryWithEval },
		{
			bindings: allBindings,
			outputFns: { [outputName]: `graph_eval_${outputName}` },
			callArgs: ['position']
		}
	);

	const paramsStruct = hasGraphParams ? buildParamsStructWgsl(emitted.params) : '';
	const { vertexWgsl, vertexCount } = await resolveVertexAssembly(graph, resolver);
	const code = [paramsStruct, vertexWgsl, stage.code].filter(Boolean).join('\n\n');

	return {
		code,
		outputName,
		vertexCount,
		params: emitted.params,
		bindings: allBindings,
		paramsBindingIndex
	};
}

export async function executeKernelFragment(
	input: KernelFragmentInput
): Promise<FullscreenFragmentResult> {
	const { device, graph, output, bindings, width, height, kernelBindings } = input;
	if (width <= 0 || height <= 0) {
		throw new RangeError('width and height must be positive');
	}

	const assembly = await assembleKernelFragmentModuleAsync({
		graph,
		output,
		bindings,
		wgslTypes: kernelBindings.wgslTypes,
		resolver: input.resolver
	});

	const pipeline = await createKernelFragmentPipeline(device, assembly.code);
	const resolved = resolveKernelBindings(bindings, 'fragment', kernelBindings.resourceIds);
	const bindGroupEntries = buildComputeBindGroupEntries(resolved, kernelBindings.resources);

	let graphParamsBuffer: GPUBuffer | null = null;
	if (assembly.params.length > 0) {
		const graphParamsData = packGraphParams(width, height, assembly.params, graph);
		graphParamsBuffer = device.createBuffer({
			label: 'kernel-fragment-graph-params',
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
			binding: assembly.paramsBindingIndex,
			resource: { buffer: graphParamsBuffer }
		});
	}

	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: bindGroupEntries
	});

	const encoder = device.createCommandEncoder({ label: 'kernel-fragment' });
	const pass = encoder.beginRenderPass({
		label: 'kernel-fragment',
		colorAttachments: [
			{
				view: input.target.createView(),
				loadOp: 'clear',
				storeOp: 'store',
				clearValue: { r: 0, g: 0, b: 0, a: 1 }
			}
		]
	});
	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.draw(assembly.vertexCount);
	pass.end();

	const pixelBytes = rgba8BufferByteLength(width, height);
	const bytesPerRow = alignTo(width * 4, 256);
	const paddedBytes = bytesPerRow * height;
	const readbackBuffer = device.createBuffer({
		label: 'kernel-fragment-readback',
		size: paddedBytes,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	});
	encoder.copyTextureToBuffer(
		{ texture: input.target },
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

	graphParamsBuffer?.destroy();
	readbackBuffer.destroy();

	return { width, height, pixels };
}
