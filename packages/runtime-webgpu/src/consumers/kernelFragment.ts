import {
	assembleStageEntry,
	compileGraph,
	type BindingDecl,
	type VaryingDecl,
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
	buildChannelBindGroupEntries,
	deriveChannelBindingDecls,
	resolveVertexAssembly,
	wgslReferencesShaderToyUniform,
	type FullscreenFragmentResult,
	type ShaderToyHostInputs
} from './fullscreenFragment.js';
import {
	packShaderToyUniforms,
	SHADERTOY_UNIFORM_BYTE_LENGTH,
	SHADERTOY_UNIFORM_STRUCT_WGSL
} from './shadertoyUniforms.js';

export interface KernelFragmentBindingInput {
	/** Binding name -> concrete WGSL type string. */
	wgslTypes: ReadonlyMap<string, string>;
	/** Binding name -> resourceId. */
	resourceIds: ReadonlyMap<string, string>;
	/** resourceId -> the real, already-allocated GPU resource. */
	resources: ReadonlyMap<string, ComputeKernelResource>;
}

export interface KernelFragmentVertexModule {
	code: string;
	vertexCount: number;
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
	host: ShaderToyHostInputs;
	target: GPUTexture;
	kernelBindings: KernelFragmentBindingInput;
	channelTargets?: ReadonlyMap<number, GPUTexture>;
	varyings?: readonly VaryingDecl[];
	vertexModule?: KernelFragmentVertexModule;
}

export interface KernelFragmentAssemblyInput {
	graph: GraphDocument;
	output: PortRef;
	bindings: readonly KernelBindingTemplate[];
	wgslTypes: ReadonlyMap<string, string>;
	resolver?: WgslModuleResolver;
	varyings?: readonly VaryingDecl[];
}

export interface KernelFragmentAssembly {
	code: string;
	outputName: string;
	vertexCount: number;
	params: GraphParamField[];
	bindings: BindingDecl[];
	paramsBindingIndex: number;
	usesShaderToyHost: boolean;
	channelBindings: ReadonlyMap<number, { textureBinding: number; samplerBinding: number }>;
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

function buildKernelGraphEvalFn(
	outputName: string,
	body: string[],
	resultExpr: string,
	varyings: readonly VaryingDecl[] = []
): string {
	const params = ['position: vec4f', ...varyings.map((varying) => `${varying.name}: ${varying.wgslType}`)];
	return `fn graph_eval_${outputName}(${params.join(', ')}) -> vec4f {
	${body.map((line) => `\t${line}`).join('\n')}
	\treturn ${resultExpr};
}`;
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
	const varyings = input.varyings ?? [];

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

	const emitted = emitGraphVec4Eval(graph, output, {
		shaderToy: false,
		...(varyings.some((varying) => varying.name === 'uv') ? { uvExpr: 'uv' } : {})
	});
	const evalFn = buildKernelGraphEvalFn(outputName, emitted.body, emitted.resultExpr, varyings);
	const libraryWithEval = `${consumerShader.code}\n\n${evalFn}`;
	const kernelBindingDecls = buildKernelBindingDecls(bindings, wgslTypes);
	const usesShaderToyHost = wgslReferencesShaderToyUniform(libraryWithEval);
	const hasGraphParams = emitted.params.length > 0;
	let nextBinding = nextFreeBindingIndex(bindings);
	const derivedBindings: BindingDecl[] = [];
	if (usesShaderToyHost) {
		derivedBindings.push({
			group: 0,
			binding: nextBinding,
			name: 'u',
			kind: 'uniform',
			wgslType: 'ShaderToyUniforms'
		});
		nextBinding += 1;
	}
	const paramsBindingIndex = nextBinding;
	if (hasGraphParams) {
		derivedBindings.push({
			group: 0,
			binding: paramsBindingIndex,
			name: 'params',
			kind: 'uniform',
			wgslType: 'GraphParams'
		});
		nextBinding += 1;
	}
	const channelAssembly = deriveChannelBindingDecls(emitted.usedChannels, nextBinding);
	derivedBindings.push(...channelAssembly.bindings);

	const allBindings: BindingDecl[] = [...kernelBindingDecls, ...derivedBindings];

	const stage = assembleStageEntry(
		{ ...consumerShader, code: libraryWithEval },
		{
			bindings: allBindings,
			outputFns: { [outputName]: `graph_eval_${outputName}` },
			callArgs:
				varyings.length > 0
					? ['input.position', ...varyings.map((varying) => `input.${varying.name}`)]
					: ['position'],
			varyings: [...varyings]
		}
	);

	const paramsStruct = hasGraphParams ? buildParamsStructWgsl(emitted.params) : '';
	const vertexAssembly =
		varyings.length > 0 ? undefined : await resolveVertexAssembly(graph, resolver);
	const codeParts = usesShaderToyHost
		? [SHADERTOY_UNIFORM_STRUCT_WGSL, paramsStruct, vertexAssembly?.vertexWgsl, stage.code]
		: [paramsStruct, vertexAssembly?.vertexWgsl, stage.code];
	const code = codeParts.filter(Boolean).join('\n\n');

	return {
		code,
		outputName,
		vertexCount: vertexAssembly?.vertexCount ?? 0,
		params: emitted.params,
		bindings: allBindings,
		paramsBindingIndex,
		usesShaderToyHost,
		channelBindings: channelAssembly.channelBindings
	};
}

export async function executeKernelFragment(
	input: KernelFragmentInput
): Promise<FullscreenFragmentResult> {
	const { device, graph, output, bindings, width, height, host, kernelBindings } = input;
	if (width <= 0 || height <= 0) {
		throw new RangeError('width and height must be positive');
	}

	const assembly = await assembleKernelFragmentModuleAsync({
		graph,
		output,
		bindings,
		wgslTypes: kernelBindings.wgslTypes,
		resolver: input.resolver,
		varyings: input.varyings
	});
	const code = input.vertexModule ? `${input.vertexModule.code}\n\n${assembly.code}` : assembly.code;
	const vertexCount = input.vertexModule?.vertexCount ?? assembly.vertexCount;
	for (const channel of assembly.channelBindings.keys()) {
		if (!input.channelTargets?.has(channel)) {
			throw new Error(`Missing channel target for channel ${channel}`);
		}
	}

	const pipeline = await createKernelFragmentPipeline(device, code);
	const resolved = resolveKernelBindings(bindings, 'fragment', kernelBindings.resourceIds);
	const bindGroupEntries = buildComputeBindGroupEntries(resolved, kernelBindings.resources);

	let uniformBuffer: GPUBuffer | null = null;
	if (assembly.usesShaderToyHost) {
		const uBinding = assembly.bindings.find((binding) => binding.name === 'u');
		if (!uBinding) {
			throw new Error('assembly reports usesShaderToyHost but declared no u binding');
		}
		const uniformData = packShaderToyUniforms({
			width,
			height,
			iTime: host.iTime,
			iMouse: host.iMouse,
			iFrame: host.iFrame
		});
		uniformBuffer = device.createBuffer({
			label: 'kernel-fragment-shadertoy-uniforms',
			size: alignTo(SHADERTOY_UNIFORM_BYTE_LENGTH, 16),
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(uniformBuffer, 0, uniformData);
		bindGroupEntries.push({ binding: uBinding.binding, resource: { buffer: uniformBuffer } });
	}

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
	if (assembly.channelBindings.size > 0) {
		bindGroupEntries.push(
			...buildChannelBindGroupEntries(
				device,
				assembly.channelBindings,
				input.channelTargets ?? new Map()
			)
		);
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
	pass.draw(vertexCount);
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

	uniformBuffer?.destroy();
	graphParamsBuffer?.destroy();
	readbackBuffer.destroy();

	return { width, height, pixels };
}
