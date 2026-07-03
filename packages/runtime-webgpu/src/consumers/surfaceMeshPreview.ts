import {
	evaluateMeshGenCpu,
	executeMeshGen,
	meshGenRequestForLegacySurface,
	type GeneratedMesh,
	type LegacySurfaceId,
	type MeshGenRequest
} from '../consumers/meshGen.js';

export interface SurfaceMeshPreviewInput {
	device: GPUDevice;
	canvas: HTMLCanvasElement;
	surfaceId: LegacySurfaceId;
	gridSize?: number;
	/** Use `surface.cubeFace → transform.spherify` for cube-sphere (graph decomposition proof). */
	decomposedCubeSphere?: boolean;
	renderMode?: MeshPreviewRenderMode;
	camera?: MeshPreviewCamera;
}

export type MeshPreviewRenderMode = 'solid' | 'wireframe';

export interface MeshPreviewCamera {
	yaw: number;
	pitch: number;
	distance: number;
}

export interface MeshGenPreviewInput {
	device: GPUDevice;
	canvas: HTMLCanvasElement;
	request: MeshGenRequest;
	renderMode?: MeshPreviewRenderMode;
	camera?: MeshPreviewCamera;
}

type Mat4 = Float32Array;

const DEFAULT_MESH_PREVIEW_EYE = [2.2, 1.6, 2.2] as const;
const DEFAULT_MESH_PREVIEW_TARGET = [0, 0, 0] as const satisfies readonly [
	number,
	number,
	number
];
const MAX_MESH_PREVIEW_PITCH = Math.PI / 2 - 0.05;

type MeshPreviewBuffers = {
	device: GPUDevice;
	request: MeshGenRequest;
	vertexBuffer: GPUBuffer;
	vertexCount: number;
	triangleIndexBuffer: GPUBuffer;
	triangleIndexCount: number;
	wireframeIndexBuffer: GPUBuffer;
	wireframeIndexCount: number;
};

const meshPreviewBufferCache = new WeakMap<HTMLCanvasElement, MeshPreviewBuffers>();

function cameraFromEye(eye: readonly [number, number, number]): MeshPreviewCamera {
	const distance = Math.hypot(eye[0], eye[1], eye[2]) || 1;
	return {
		yaw: Math.atan2(eye[0], eye[2]),
		pitch: Math.asin(eye[1] / distance),
		distance
	};
}

export const DEFAULT_MESH_PREVIEW_CAMERA = cameraFromEye(DEFAULT_MESH_PREVIEW_EYE);

export function clampMeshPreviewPitch(pitch: number): number {
	return Math.min(MAX_MESH_PREVIEW_PITCH, Math.max(-MAX_MESH_PREVIEW_PITCH, pitch));
}

export function meshPreviewCameraEye(
	camera: MeshPreviewCamera,
	target: readonly [number, number, number] = DEFAULT_MESH_PREVIEW_TARGET
): [number, number, number] {
	const pitch = clampMeshPreviewPitch(camera.pitch);
	const radius = Math.max(0.05, camera.distance);
	const planar = Math.cos(pitch) * radius;
	return [
		target[0] + Math.sin(camera.yaw) * planar,
		target[1] + Math.sin(pitch) * radius,
		target[2] + Math.cos(camera.yaw) * planar
	];
}

export const SURFACE_MESH_PREVIEW_SHADER = `
struct Uniforms {
	viewProj: mat4x4<f32>,
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
	let color = vec3f(0.5, 0.62, 0.82) * (0.18 + diff * 0.82);
	return vec4f(color, 1.0);
}
`;

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

export function meshPreviewViewProjection(
	aspect: number,
	camera: MeshPreviewCamera = DEFAULT_MESH_PREVIEW_CAMERA
): Mat4 {
	const view = lookAt(meshPreviewCameraEye(camera), DEFAULT_MESH_PREVIEW_TARGET, [0, 1, 0]);
	const proj = perspective((50 * Math.PI) / 180, aspect, 0.05, 20);
	return mat4Multiply(proj, view);
}

export function buildWireframeIndices(triangleIndices: Uint32Array): Uint32Array {
	const edges = new Set<string>();
	const lines: number[] = [];

	function addEdge(a: number, b: number) {
		const lo = Math.min(a, b);
		const hi = Math.max(a, b);
		const key = `${lo}:${hi}`;
		if (edges.has(key)) return;
		edges.add(key);
		lines.push(lo, hi);
	}

	for (let i = 0; i < triangleIndices.length; i += 3) {
		const a = triangleIndices[i];
		const b = triangleIndices[i + 1];
		const c = triangleIndices[i + 2];
		if (a === undefined || b === undefined || c === undefined) continue;
		addEdge(a, b);
		addEdge(b, c);
		addEdge(c, a);
	}

	return new Uint32Array(lines);
}

function packInterleavedVertices(mesh: GeneratedMesh): Float32Array {
	const data = new Float32Array(mesh.vertexCount * 6);
	for (let i = 0; i < mesh.vertexCount; i++) {
		const src = i * 3;
		const dst = i * 6;
		data[dst] = mesh.positions[src];
		data[dst + 1] = mesh.positions[src + 1];
		data[dst + 2] = mesh.positions[src + 2];
		data[dst + 3] = mesh.normals[src];
		data[dst + 4] = mesh.normals[src + 1];
		data[dst + 5] = mesh.normals[src + 2];
	}
	return data;
}

function createRenderPipeline(
	device: GPUDevice,
	format: GPUTextureFormat,
	renderMode: MeshPreviewRenderMode
): GPURenderPipeline {
	const module = device.createShaderModule({ label: 'surface-mesh-preview', code: SURFACE_MESH_PREVIEW_SHADER });
	return device.createRenderPipeline({
		label: `surface-mesh-preview-${renderMode}`,
		layout: 'auto',
		vertex: {
			module,
			entryPoint: 'vs',
			buffers: [
				{
					arrayStride: 24,
					attributes: [
						{ shaderLocation: 0, offset: 0, format: 'float32x3' },
						{ shaderLocation: 1, offset: 12, format: 'float32x3' }
					]
				}
			]
		},
		fragment: {
			module,
			entryPoint: 'fs',
			targets: [{ format }]
		},
		primitive:
			renderMode === 'wireframe'
				? { topology: 'line-list' }
				: { topology: 'triangle-list', cullMode: 'back' },
		depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' }
	});
}

function sameMeshRequest(a: MeshGenRequest, b: MeshGenRequest): boolean {
	return (
		a.graph === b.graph &&
		a.position.node === b.position.node &&
		a.position.port === b.position.port &&
		a.normal?.node === b.normal?.node &&
		a.normal?.port === b.normal?.port &&
		a.gridSize === b.gridSize &&
		a.faceCount === b.faceCount
	);
}

function destroyMeshPreviewBuffers(buffers: MeshPreviewBuffers): void {
	buffers.vertexBuffer.destroy();
	buffers.triangleIndexBuffer.destroy();
	buffers.wireframeIndexBuffer.destroy();
}

async function ensureMeshPreviewBuffers(
	device: GPUDevice,
	canvas: HTMLCanvasElement,
	request: MeshGenRequest
): Promise<MeshPreviewBuffers> {
	const cached = meshPreviewBufferCache.get(canvas);
	if (cached && cached.device === device && sameMeshRequest(cached.request, request)) {
		return cached;
	}
	if (cached) {
		destroyMeshPreviewBuffers(cached);
		meshPreviewBufferCache.delete(canvas);
	}

	let mesh: GeneratedMesh;
	try {
		mesh = await executeMeshGen(device, request);
	} catch (error) {
		console.warn('Mesh preview GPU path failed; falling back to CPU mesh generation.', error);
		mesh = evaluateMeshGenCpu(request);
	}

	const vertexData = packInterleavedVertices(mesh);
	const vertexBuffer = device.createBuffer({
		label: 'surface-mesh-preview-vertices',
		size: vertexData.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(vertexBuffer, 0, vertexData.buffer, vertexData.byteOffset, vertexData.byteLength);

	const triangleIndexBuffer = device.createBuffer({
		label: 'surface-mesh-preview-indices',
		size: mesh.indices.byteLength,
		usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(
		triangleIndexBuffer,
		0,
		mesh.indices.buffer,
		mesh.indices.byteOffset,
		mesh.indices.byteLength
	);

	const wireframeIndices = buildWireframeIndices(mesh.indices);
	const wireframeIndexBuffer = device.createBuffer({
		label: 'surface-mesh-preview-wireframe-indices',
		size: wireframeIndices.byteLength,
		usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(
		wireframeIndexBuffer,
		0,
		wireframeIndices.buffer,
		wireframeIndices.byteOffset,
		wireframeIndices.byteLength
	);

	const buffers: MeshPreviewBuffers = {
		device,
		request,
		vertexBuffer,
		vertexCount: mesh.vertexCount,
		triangleIndexBuffer,
		triangleIndexCount: mesh.indexCount,
		wireframeIndexBuffer,
		wireframeIndexCount: wireframeIndices.length
	};
	meshPreviewBufferCache.set(canvas, buffers);
	return buffers;
}

/** Render a graph-generated mesh into a WebGPU canvas (orbit camera, flat shading). */
export async function renderMeshGenPreview(input: MeshGenPreviewInput): Promise<void> {
	const {
		device,
		canvas,
		request,
		renderMode = 'solid',
		camera = DEFAULT_MESH_PREVIEW_CAMERA
	} = input;
	const context = canvas.getContext('webgpu');
	if (!context) {
		throw new Error('WebGPU canvas context unavailable');
	}

	const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format, alphaMode: 'opaque' });

	const buffers = await ensureMeshPreviewBuffers(device, canvas, request);
	const pipeline = createRenderPipeline(device, format, renderMode);
	const bindGroupLayout = pipeline.getBindGroupLayout(0);

	const aspect = canvas.width / Math.max(1, canvas.height);
	const viewProj = meshPreviewViewProjection(aspect, camera);
	const uniformBuffer = device.createBuffer({
		label: 'surface-mesh-preview-uniforms',
		size: 64,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(uniformBuffer, 0, viewProj.buffer, viewProj.byteOffset, viewProj.byteLength);

	const bindGroup = device.createBindGroup({
		layout: bindGroupLayout,
		entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
	});

	const depthTexture = device.createTexture({
		label: 'surface-mesh-preview-depth',
		size: [canvas.width, canvas.height],
		format: 'depth24plus',
		usage: GPUTextureUsage.RENDER_ATTACHMENT
	});

	const encoder = device.createCommandEncoder({ label: 'surface-mesh-preview' });
	const pass = encoder.beginRenderPass({
		label: 'surface-mesh-preview',
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
			depthClearValue: 1,
			depthLoadOp: 'clear',
			depthStoreOp: 'discard'
		}
	});
	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.setVertexBuffer(0, buffers.vertexBuffer);
	pass.setIndexBuffer(
		renderMode === 'wireframe' ? buffers.wireframeIndexBuffer : buffers.triangleIndexBuffer,
		'uint32'
	);
	pass.drawIndexed(
		renderMode === 'wireframe' ? buffers.wireframeIndexCount : buffers.triangleIndexCount
	);
	pass.end();
	device.queue.submit([encoder.finish()]);

	uniformBuffer.destroy();
	depthTexture.destroy();
}

/** Render a graph-generated surface mesh into a WebGPU canvas (orbit camera, flat shading). */
export async function renderSurfaceMeshPreview(input: SurfaceMeshPreviewInput): Promise<void> {
	const {
		device,
		canvas,
		surfaceId,
		gridSize = 16,
		decomposedCubeSphere = false,
		renderMode,
		camera
	} = input;
	const request = meshGenRequestForLegacySurface(surfaceId, gridSize, {
		decomposedCubeSphere: surfaceId === 'surface.cubeSphere' && decomposedCubeSphere
	});
	await renderMeshGenPreview({ device, canvas, request, renderMode, camera });
}
