import { generateWgsl, sliceGraph, type WgslModuleResolver } from '@world-lab/compiler';
import type { GraphDocument, PortRef } from '@world-lab/graph';

import { alignTo, createStorageBuffer } from '../buffers.js';
import {
	buildParamsStructWgsl,
	emitGraphVec3Eval,
	type GraphParamField
} from '../emitGraphEval.js';
import { createStandardLibraryResolver } from '../moduleResolver.js';
import {
	executeVegetationCandidateCompute,
	type VegetationCandidateComputeOptions
} from './vegetationCandidates.js';
import { renderInstancedMesh } from './instancedMeshDraw.js';
import {
	computeVegetationGridSize,
	type VegetationCandidateConfig,
	type VegetationCandidateGpuRecord,
	type VegetationGraphBinding,
	type VegetationPatch
} from '../vegetationTypes.js';

export type VegetationPreviewMode = 'none' | 'statistical' | 'impostor' | 'full';

const VEGETATION_INSTANCE_LAYOUT = {
	arrayStride: 16,
	attributes: [
		{ shaderLocation: 2, offset: 0, format: 'float32x3' as const },
		{ shaderLocation: 3, offset: 12, format: 'float32' as const }
	]
};

export interface VegetationPreviewInput {
	device: GPUDevice;
	canvas: HTMLCanvasElement;
	patch: VegetationPatch;
	config: VegetationCandidateConfig;
	density: VegetationGraphBinding;
	placement: VegetationGraphBinding;
	altitudeMeters: number;
}

export interface VegetationPreviewResult {
	mode: VegetationPreviewMode;
	candidateCount: number;
	overflowed: boolean;
	candidates: VegetationCandidateGpuRecord[];
}

export type VegetationPreviewOptions = VegetationPreviewInput & {
	moduleResolver?: WgslModuleResolver;
};

// Math and Matrix Helpers
type Mat4 = Float32Array;

function dot3(a: readonly number[], b: readonly number[]): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: readonly number[], b: readonly number[]): [number, number, number] {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0]
	];
}

function normalize3(v: readonly number[]): [number, number, number] {
	const len = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / len, v[1] / len, v[2] / len];
}

function subtract3(a: readonly number[], b: readonly number[]): [number, number, number] {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
	const out = new Float32Array(16);
	for (let c = 0; c < 4; c++) {
		for (let r = 0; r < 4; r++) {
			out[c * 4 + r] =
				a[0 * 4 + r] * b[c * 4 + 0] +
				a[1 * 4 + r] * b[c * 4 + 1] +
				a[2 * 4 + r] * b[c * 4 + 2] +
				a[3 * 4 + r] * b[c * 4 + 3];
		}
	}
	return out;
}

function perspective(fovyRad: number, aspect: number, near: number, far: number): Mat4 {
	const f = 1 / Math.tan(fovyRad / 2);
	const nf = 1 / (near - far);
	return new Float32Array([
		f / aspect,
		0,
		0,
		0,
		0,
		f,
		0,
		0,
		0,
		0,
		(far + near) * nf,
		-1,
		0,
		0,
		2 * far * near * nf,
		0
	]);
}

function lookAt(
	eye: readonly [number, number, number],
	target: readonly [number, number, number],
	up: readonly [number, number, number]
): Mat4 {
	const zAxis = normalize3(subtract3(eye, target));
	const xAxis = normalize3(cross3(up, zAxis));
	const yAxis = cross3(zAxis, xAxis);
	return new Float32Array([
		xAxis[0],
		yAxis[0],
		zAxis[0],
		0,
		xAxis[1],
		yAxis[1],
		zAxis[1],
		0,
		xAxis[2],
		yAxis[2],
		zAxis[2],
		0,
		-dot3(xAxis, eye),
		-dot3(yAxis, eye),
		-dot3(zAxis, eye),
		1
	]);
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

function packPatchParams(patch: VegetationPatch, config: VegetationCandidateConfig, maxCandidates: number, gridWidth: number, gridHeight: number): ArrayBuffer {
	const buffer = new ArrayBuffer(112);
	const view = new DataView(buffer);
	let offset = 0;

	for (let component = 0; component < 3; component += 1) {
		view.setFloat32(offset + component * 4, patch.origin[component], true);
	}
	offset += 16;

	for (let component = 0; component < 3; component += 1) {
		view.setFloat32(offset + component * 4, patch.tangentX[component], true);
	}
	offset += 16;

	for (let component = 0; component < 3; component += 1) {
		view.setFloat32(offset + component * 4, patch.tangentY[component], true);
	}
	offset += 16;

	view.setFloat32(offset, patch.widthMeters, true);
	view.setFloat32(offset + 4, patch.heightMeters, true);
	view.setFloat32(offset + 8, config.spacingMeters, true);
	offset += 12;

	view.setUint32(offset, gridWidth, true);
	view.setUint32(offset + 4, gridHeight, true);
	view.setUint32(offset + 8, config.channel, true);
	offset += 12;

	view.setFloat32(offset, config.placementThreshold, true);
	view.setFloat32(offset + 4, config.densityThreshold, true);
	view.setFloat32(offset + 8, config.minProminence, true);
	offset += 12;

	const disabled = Number.NaN;
	view.setFloat32(offset, config.minAltitudeMeters ?? disabled, true);
	view.setFloat32(offset + 4, config.maxAltitudeMeters ?? disabled, true);
	view.setFloat32(offset + 8, config.maxSlope ?? disabled, true);
	offset += 12;

	view.setUint32(offset, maxCandidates, true);
	return buffer;
}

function packGraphParams(
	fields: GraphParamField[],
	graphs: GraphDocument[]
): Float32Array {
	const values = [0, 0];
	for (const field of fields) {
		const doc = graphs.find((graph) => graph.nodes.some((node) => node.id === field.nodeId));
		if (!doc) {
			values.push(field.defaultValue);
			continue;
		}
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

// Flat shaded cone template generator
function buildConeGeometry(): { positions: Float32Array; normals: Float32Array; indices: Uint16Array } {
	const radius = 0.15;
	const height = 0.6;
	const segments = 5;

	// Calculate base vertices
	const base: [number, number, number][] = [];
	for (let i = 0; i < segments; i++) {
		const angle = (i * 2 * Math.PI) / segments;
		base.push([radius * Math.cos(angle), 0, radius * Math.sin(angle)]);
	}

	const tip: [number, number, number] = [0, height, 0];

	const posList: number[] = [];
	const normList: number[] = [];
	const indexList: number[] = [];

	let vCount = 0;

	// Side triangles
	for (let i = 0; i < segments; i++) {
		const a = base[i]!;
		const b = base[(i + 1) % segments]!;

		// flat normals
		const edge1 = subtract3(b, a);
		const edge2 = subtract3(tip, a);
		const n = normalize3(cross3(edge1, edge2));

		posList.push(...a, ...b, ...tip);
		normList.push(...n, ...n, ...n);
		indexList.push(vCount, vCount + 1, vCount + 2);
		vCount += 3;
	}

	// Base triangles (flat shaded down)
	const baseNormal = [0, -1, 0];
	for (let i = 1; i < segments - 1; i++) {
		posList.push(...base[0]!, ...base[i + 1]!, ...base[i]!);
		normList.push(...baseNormal, ...baseNormal, ...baseNormal);
		indexList.push(vCount, vCount + 1, vCount + 2);
		vCount += 3;
	}

	return {
		positions: new Float32Array(posList),
		normals: new Float32Array(normList),
		indices: new Uint16Array(indexList)
	};
}

// Flat shaded quad template generator
function buildQuadGeometry(): { positions: Float32Array; normals: Float32Array; indices: Uint16Array } {
	const width = 0.3;
	const height = 0.6;
	const halfW = width / 2;

	// Simple quad vertices centered at x=0
	const positions = new Float32Array([
		-halfW, 0, 0,
		 halfW, 0, 0,
		-halfW, height, 0,
		 halfW, height, 0
	]);

	const normals = new Float32Array([
		0, 0, 1,
		0, 0, 1,
		0, 0, 1,
		0, 0, 1
	]);

	const indices = new Uint16Array([
		0, 1, 3,
		0, 3, 2
	]);

	return { positions, normals, indices };
}

// Shaders

const PLANE_SHADER = `
struct Uniforms {
	viewProj: mat4x4<f32>,
	view: mat4x4<f32>,
	proj: mat4x4<f32>,
	channel: u32,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexIn {
	@location(0) position: vec3f,
	@location(1) normal: vec3f,
};

struct VertexOut {
	@builtin(position) clip: vec4f,
	@location(0) normal: vec3f,
};

@vertex
fn vs(input: VertexIn) -> VertexOut {
	var out: VertexOut;
	out.normal = input.normal;
	out.clip = uniforms.viewProj * vec4f(input.position, 1.0);
	return out;
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
	let n = normalize(input.normal);
	let light = normalize(vec3f(0.35, 0.75, 0.55));
	let diff = max(dot(n, light), 0.0);
	let color = vec3f(0.12, 0.16, 0.22) * (0.3 + diff * 0.7);
	return vec4f(color, 1.0);
}
`;

function buildStatisticalShader(
	moduleCode: string,
	paramsStruct: string,
	densityBody: string[],
	densityResultExpr: string
): string {
	return `${moduleCode}

struct Uniforms {
	viewProj: mat4x4<f32>,
	view: mat4x4<f32>,
	proj: mat4x4<f32>,
	channel: u32,
};

struct VegetationPatchParams {
	origin: vec3<f32>,
	_pad0: f32,
	tangent_x: vec3<f32>,
	_pad1: f32,
	tangent_y: vec3<f32>,
	_pad2: f32,
	width_meters: f32,
	height_meters: f32,
	spacing_meters: f32,
	grid_width: u32,
	grid_height: u32,
	channel: u32,
	placement_threshold: f32,
	density_threshold: f32,
	min_prominence: f32,
	min_altitude_meters: f32,
	max_altitude_meters: f32,
	max_slope: f32,
	max_candidates: u32,
}

${paramsStruct}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> graph_params: GraphParams;
@group(0) @binding(2) var<uniform> patch_params: VegetationPatchParams;

struct VertexIn {
	@location(0) position: vec3f,
	@location(1) normal: vec3f,
};

struct VertexOut {
	@builtin(position) clip: vec4f,
	@location(0) worldPos: vec3f,
};

fn evaluate_density(position: vec3<f32>) -> vec3<f32> {
${densityBody.map((line) => `\t${line}`).join('\n')}
\treturn ${densityResultExpr};
}

@vertex
fn vs(input: VertexIn) -> VertexOut {
	var out: VertexOut;
	out.worldPos = input.position;
	out.clip = uniforms.viewProj * vec4f(input.position, 1.0);
	return out;
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
	let density = evaluate_density(input.worldPos);
	var c: f32 = 0.0;
	if (uniforms.channel == 0u) {
		c = density.x;
	} else if (uniforms.channel == 1u) {
		c = density.y;
	} else {
		c = density.z;
	}
	let color = mix(vec3f(0.12, 0.16, 0.22), vec3f(0.1, 0.65, 0.25), clamp(c, 0.0, 1.0));
	return vec4f(color, 1.0);
}
`;
}

const IMPOSTOR_SHADER = `
struct Uniforms {
	viewProj: mat4x4<f32>,
	view: mat4x4<f32>,
	proj: mat4x4<f32>,
	channel: u32,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexIn {
	@location(0) position: vec3f,
	@location(1) normal: vec3f,
	@location(2) instPosition: vec3f,
	@location(3) instVigor: f32,
};

struct VertexOut {
	@builtin(position) clip: vec4f,
	@location(0) normal: vec3f,
};

@vertex
fn vs(input: VertexIn) -> VertexOut {
	var out: VertexOut;
	out.normal = input.normal;
	
	// Billboard transformation
	let viewPos = uniforms.view * vec4f(input.instPosition, 1.0);
	let localOffset = input.position * (0.5 + input.instVigor * 0.5);
	let billboardPos = viewPos + vec4f(localOffset.x, localOffset.y, 0.0, 0.0);
	
	out.clip = uniforms.proj * billboardPos;
	return out;
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
	// Billboard flat green colored
	return vec4f(0.12, 0.58, 0.22, 1.0);
}
`;

const FULL_SHADER = `
struct Uniforms {
	viewProj: mat4x4<f32>,
	view: mat4x4<f32>,
	proj: mat4x4<f32>,
	channel: u32,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexIn {
	@location(0) position: vec3f,
	@location(1) normal: vec3f,
	@location(2) instPosition: vec3f,
	@location(3) instVigor: f32,
};

struct VertexOut {
	@builtin(position) clip: vec4f,
	@location(0) normal: vec3f,
};

@vertex
fn vs(input: VertexIn) -> VertexOut {
	var out: VertexOut;
	out.normal = input.normal;
	
	// Scale by vigor
	let scale = 0.5 + input.instVigor * 0.5;
	let worldPos = input.instPosition + input.position * scale;
	
	out.clip = uniforms.viewProj * vec4f(worldPos, 1.0);
	return out;
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
	let n = normalize(input.normal);
	let light = normalize(vec3f(0.35, 0.75, 0.55));
	let diff = max(dot(n, light), 0.0);
	let color = vec3f(0.18, 0.49, 0.2) * (0.4 + diff * 0.6);
	return vec4f(color, 1.0);
}
`;

// RangeError triggers mirroring vegetation compute validation
function validateInput(patch: VegetationPatch, config: VegetationCandidateConfig): void {
	if (patch.widthMeters <= 0 || patch.heightMeters <= 0 || config.spacingMeters <= 0) {
		throw new RangeError('patch dimensions and spacing must be positive');
	}
	if (config.channel < 0 || config.channel > 2) {
		throw new RangeError('channel must be 0, 1, or 2');
	}
	if (config.placementThreshold < 0 || config.placementThreshold > 1 ||
		config.densityThreshold < 0 || config.densityThreshold > 1 ||
		config.minProminence < 0) {
		throw new RangeError('thresholds/prominences must be valid');
	}
}

export async function renderVegetationPreview(
	input: VegetationPreviewOptions
): Promise<VegetationPreviewResult> {
	const { device, canvas, patch, config, density, placement, altitudeMeters, moduleResolver } = input;
	validateInput(patch, config);

	const context = canvas.getContext('webgpu');
	if (!context) {
		throw new Error('WebGPU canvas context unavailable');
	}

	const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format, alphaMode: 'opaque' });

	// Determine preview mode
	let mode: VegetationPreviewMode = 'none';
	if (altitudeMeters >= 2000) {
		mode = 'none';
	} else if (altitudeMeters >= 500) {
		mode = 'statistical';
	} else if (altitudeMeters >= 150) {
		mode = 'impostor';
	} else {
		mode = 'full';
	}

	const { gridWidth, gridHeight } = computeVegetationGridSize(patch, config.spacingMeters);
	const resolver = moduleResolver ?? createStandardLibraryResolver();

	// 1. Compile and optionally dispatch Candidates compute shader if in impostor/full modes
	let candidateCount = 0;
	let overflowed = false;
	let candidatesList: VegetationCandidateGpuRecord[] = [];

	if (mode === 'impostor' || mode === 'full') {
		const result = await executeVegetationCandidateCompute({
			device,
			patch,
			config,
			density,
			placement,
			maxCandidates: 1000
		});
		candidateCount = result.candidateCount;
		overflowed = result.overflowed;
		candidatesList = result.candidates;
	}

	// 2. Setup Matrices (View/Proj)
	const aspect = canvas.width / Math.max(1, canvas.height);
	const target: [number, number, number] = [patch.widthMeters / 2, 0, patch.heightMeters / 2];
	const eye: [number, number, number] = [
		target[0] + 1.5 * patch.widthMeters,
		patch.widthMeters * 0.8,
		target[2] + 1.5 * patch.heightMeters
	];
	const viewMat = lookAt(eye, target, [0, 1, 0]);
	const projMat = perspective((50 * Math.PI) / 180, aspect, 0.05, 100);
	const viewProjMat = mat4Multiply(projMat, viewMat);

	// Pack matrix uniforms
	const renderUniformData = new ArrayBuffer(208);
	const viewFloat = new Float32Array(renderUniformData, 0, 16);
	const viewMatFloat = new Float32Array(renderUniformData, 64, 16);
	const projMatFloat = new Float32Array(renderUniformData, 128, 16);
	const channelUint = new Uint32Array(renderUniformData, 192, 1);

	viewFloat.set(viewProjMat);
	viewMatFloat.set(viewMat);
	projMatFloat.set(projMat);
	channelUint[0] = config.channel;

	const renderUniformBuffer = device.createBuffer({
		label: 'vegetation-preview-render-uniforms',
		size: renderUniformData.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(renderUniformBuffer, 0, renderUniformData);

	// 3. Build Patch Plane Mesh
	const patchPositions = new Float32Array([
		0, 0, 0,
		patch.widthMeters, 0, 0,
		0, 0, patch.heightMeters,
		patch.widthMeters, 0, patch.heightMeters
	]);
	const patchNormals = new Float32Array([
		0, 1, 0,
		0, 1, 0,
		0, 1, 0,
		0, 1, 0
	]);
	const patchIndices = new Uint16Array([
		0, 1, 3,
		0, 3, 2
	]);

	const patchVertexBuffer = device.createBuffer({
		label: 'vegetation-preview-patch-vertices',
		size: patchPositions.byteLength + patchNormals.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(patchVertexBuffer, 0, patchPositions.buffer);
	device.queue.writeBuffer(patchVertexBuffer, patchPositions.byteLength, patchNormals.buffer);

	const patchIndexBuffer = device.createBuffer({
		label: 'vegetation-preview-patch-indices',
		size: patchIndices.byteLength,
		usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(patchIndexBuffer, 0, patchIndices.buffer);

	// Build Render pipelines
	let pipeline: GPURenderPipeline;
	let bindGroup: GPUBindGroup;

	const depthTexture = device.createTexture({
		label: 'vegetation-preview-depth',
		size: [canvas.width, canvas.height],
		format: 'depth24plus',
		usage: GPUTextureUsage.RENDER_ATTACHMENT
	});

	if (mode === 'statistical') {
		const outputName = findOutputName(density.graph, density.output);
		const slice = sliceGraph(density.graph, { outputs: [outputName] });
		const generated = await generateWgsl(slice, resolver);
		const emitted = emitGraphVec3Eval(density.graph, density.output, { positionExpr: 'input.worldPos' });
		const paramsStruct = buildParamsStructWgsl(emitted.params);

		const shaderCode = buildStatisticalShader(
			generated.code,
			paramsStruct,
			emitted.body,
			emitted.resultExpr
		);

		const shaderModule = device.createShaderModule({
			label: 'vegetation-preview-statistical',
			code: shaderCode
		});

		pipeline = device.createRenderPipeline({
			label: 'vegetation-preview-statistical',
			layout: 'auto',
			vertex: {
				module: shaderModule,
				entryPoint: 'vs',
				buffers: [
					{
						arrayStride: 12,
						attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
					},
					{
						arrayStride: 12,
						attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }]
					}
				]
			},
			fragment: {
				module: shaderModule,
				entryPoint: 'fs',
				targets: [{ format }]
			},
			primitive: { topology: 'triangle-list', cullMode: 'none' },
			depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' }
		});

		const graphParamBuffer = device.createBuffer({
			label: 'vegetation-preview-graph-params',
			size: alignTo(Math.max(16, (emitted.params.length + 2) * 4), 4),
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		const packed = packGraphParams(emitted.params, [density.graph]);
		device.queue.writeBuffer(graphParamBuffer, 0, packed.buffer, packed.byteOffset, packed.byteLength);

		const patchParamBuffer = device.createBuffer({
			label: 'vegetation-preview-patch-params',
			size: 112,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		const packedPatch = packPatchParams(patch, config, 1000, gridWidth, gridHeight);
		device.queue.writeBuffer(patchParamBuffer, 0, packedPatch);

		bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: renderUniformBuffer } },
				{ binding: 1, resource: { buffer: graphParamBuffer } },
				{ binding: 2, resource: { buffer: patchParamBuffer } }
			]
		});
	} else {
		// Plane mesh pipeline for none/impostor/full modes
		const shaderModule = device.createShaderModule({
			label: 'vegetation-preview-plane',
			code: PLANE_SHADER
		});

		pipeline = device.createRenderPipeline({
			label: 'vegetation-preview-plane',
			layout: 'auto',
			vertex: {
				module: shaderModule,
				entryPoint: 'vs',
				buffers: [
					{
						arrayStride: 12,
						attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
					},
					{
						arrayStride: 12,
						attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }]
					}
				]
			},
			fragment: {
				module: shaderModule,
				entryPoint: 'fs',
				targets: [{ format }]
			},
			primitive: { topology: 'triangle-list', cullMode: 'none' },
			depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' }
		});

		bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [{ binding: 0, resource: { buffer: renderUniformBuffer } }]
		});
	}

	// 4. Render pass encoder
	const encoder = device.createCommandEncoder({ label: 'vegetation-preview' });
	const pass = encoder.beginRenderPass({
		label: 'vegetation-preview',
		colorAttachments: [
			{
				view: context.getCurrentTexture().createView(),
				clearValue: { r: 0.08, g: 0.09, b: 0.13, a: 1 },
				loadOp: 'clear',
				storeOp: 'store'
			}
		],
		depthStencilAttachment: {
			view: depthTexture.createView(),
			depthClearValue: 1.0,
			depthLoadOp: 'clear',
			depthStoreOp: 'store'
		}
	});

	// Draw base patch plane
	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.setVertexBuffer(0, patchVertexBuffer, 0, patchPositions.byteLength);
	pass.setVertexBuffer(1, patchVertexBuffer, patchPositions.byteLength, patchNormals.byteLength);
	pass.setIndexBuffer(patchIndexBuffer, 'uint16');
	pass.drawIndexed(6);

	// 5. Draw instanced components if candidates generated and in impostor/full modes
	if ((mode === 'impostor' || mode === 'full') && candidateCount > 0) {
		const template = mode === 'impostor' ? buildQuadGeometry() : buildConeGeometry();

		const instanceData = new Float32Array(candidatesList.length * 4);
		for (let i = 0; i < candidatesList.length; i++) {
			const record = candidatesList[i]!;
			instanceData[i * 4] = record.position[0];
			instanceData[i * 4 + 1] = record.position[1];
			instanceData[i * 4 + 2] = record.position[2];
			instanceData[i * 4 + 3] = record.vigor;
		}

		const instanceBuffer = device.createBuffer({
			label: 'vegetation-preview-instances',
			size: instanceData.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(instanceBuffer, 0, instanceData.buffer);

		renderInstancedMesh({
			device,
			pass,
			format,
			label: 'vegetation-preview-instances',
			shaderCode: mode === 'impostor' ? IMPOSTOR_SHADER : FULL_SHADER,
			uniformBuffer: renderUniformBuffer,
			template,
			instanceBuffer,
			instanceLayout: VEGETATION_INSTANCE_LAYOUT,
			instanceCount: candidatesList.length
		});
	}

	pass.end();
	device.queue.submit([encoder.finish()]);

	return {
		mode,
		candidateCount,
		overflowed,
		candidates: candidatesList
	};
}
