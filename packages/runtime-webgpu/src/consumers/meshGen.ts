import '@world-lab/graph';
import { generateWgsl, sliceGraph } from '@world-lab/compiler';
import type { GraphDocument, Node, PortRef } from '@world-lab/graph';
import { getPrimitive, type PortSpec } from '@world-lab/graph';
import { evaluateGraphVec3Output } from '@world-lab/runtime-cpu';
import { Value } from '@world-lab/schema';

import { alignTo, createStorageBuffer } from '../buffers.js';
import {
	buildParamsStructWgsl,
	emitGraphVec3Eval,
	type GraphParamField
} from '../emitGraphEval.js';
import { createStandardLibraryResolver } from '../moduleResolver.js';

export interface MeshGenRequest {
	graph: GraphDocument;
	/** Outputs of the surface-mapping subgraph (must be vec3f). */
	position: PortRef;
	normal?: PortRef;
	/** Tessellation grid resolution per face. */
	gridSize: number;
	/** Number of faces to sweep (1 = plane/single patch, 6 = cube). */
	faceCount: number;
}

export interface GeneratedMesh {
	positions: Float32Array;
	normals: Float32Array;
	indices: Uint32Array;
	vertexCount: number;
	indexCount: number;
}

export type LegacySurfaceId = 'surface.plane' | 'surface.cubeSphere';

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Node['inputs'] {
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
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out'),
		...(params !== undefined ? { params } : {})
	};
}

const NODE_UV = 'n_uv';
const NODE_SURFACE = 'n_surface';
const NODE_SPHERIFY = 'n_spherify';

/** Minimal graph: procedural.uv → `surface.plane`. */
export function buildPlaneMeshGenGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [snapshotNode(NODE_UV, 'procedural.uv'), snapshotNode(NODE_SURFACE, 'surface.plane')],
		edges: [
			{
				id: 'e_uv_plane',
				from: { node: NODE_UV, port: 'uv' },
				to: { node: NODE_SURFACE, port: 'uv' }
			}
		],
		outputs: [
			{ name: 'position', from: { node: NODE_SURFACE, port: 'position' } },
			{ name: 'normal', from: { node: NODE_SURFACE, port: 'normal' } }
		],
	};
}

/** Minimal graph: procedural.uv → `surface.cubeSphere` (monolithic reference). */
export function buildCubeSphereMeshGenGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode(NODE_UV, 'procedural.uv'),
			snapshotNode(NODE_SURFACE, 'surface.cubeSphere', { face: 0 })
		],
		edges: [
			{
				id: 'e_uv_sphere',
				from: { node: NODE_UV, port: 'uv' },
				to: { node: NODE_SURFACE, port: 'uv' }
			}
		],
		outputs: [
			{ name: 'position', from: { node: NODE_SURFACE, port: 'position' } },
			{ name: 'normal', from: { node: NODE_SURFACE, port: 'normal' } }
		],
	};
}

/** Decomposition proof: procedural.uv → `surface.cubeFace` → `transform.spherify`. */
export function buildDecomposedCubeSphereMeshGenGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode(NODE_UV, 'procedural.uv'),
			snapshotNode(NODE_SURFACE, 'surface.cubeFace', { face: 0 }),
			snapshotNode(NODE_SPHERIFY, 'transform.spherify')
		],
		edges: [
			{
				id: 'e_uv_cube',
				from: { node: NODE_UV, port: 'uv' },
				to: { node: NODE_SURFACE, port: 'uv' }
			},
			{
				id: 'e_cube_spherify',
				from: { node: NODE_SURFACE, port: 'position' },
				to: { node: NODE_SPHERIFY, port: 'position' }
			}
		],
		outputs: [{ name: 'position', from: { node: NODE_SPHERIFY, port: 'position' } }],
	};
}

export function meshGenRequestForLegacySurface(
	surfaceId: LegacySurfaceId,
	gridSize = 16,
	opts?: { decomposedCubeSphere?: boolean }
): MeshGenRequest {
	if (surfaceId === 'surface.plane') {
		return {
			graph: buildPlaneMeshGenGraph(),
			position: { node: NODE_SURFACE, port: 'position' },
			normal: { node: NODE_SURFACE, port: 'normal' },
			gridSize,
			faceCount: 1
		};
	}

	if (opts?.decomposedCubeSphere) {
		return {
			graph: buildDecomposedCubeSphereMeshGenGraph(),
			position: { node: NODE_SPHERIFY, port: 'position' },
			gridSize,
			faceCount: 6
		};
	}

	return {
		graph: buildCubeSphereMeshGenGraph(),
		position: { node: NODE_SURFACE, port: 'position' },
		normal: { node: NODE_SURFACE, port: 'normal' },
		gridSize,
		faceCount: 6
	};
}

function findFaceParamNodes(doc: GraphDocument): string[] {
	return doc.nodes
		.filter((node) => {
			const primitive = getPrimitive(node.primitive);
			if (!primitive) return false;
			const defaults = Value.Create(primitive.params) as Record<string, unknown>;
			return 'face' in defaults;
		})
		.map((node) => node.id);
}

export function buildMeshIndices(gridSize: number, faceCount: number): Uint32Array {
	const vertsPerFace = gridSize * gridSize;
	const quadsPerFace = (gridSize - 1) * (gridSize - 1);
	const indexCount = faceCount * quadsPerFace * 6;
	const indices = new Uint32Array(indexCount);
	let index = 0;

	for (let face = 0; face < faceCount; face++) {
		const base = face * vertsPerFace;
		for (let y = 0; y < gridSize - 1; y++) {
			for (let x = 0; x < gridSize - 1; x++) {
				const i0 = base + y * gridSize + x;
				const i1 = i0 + 1;
				const i2 = i0 + gridSize;
				const i3 = i2 + 1;
				indices[index++] = i0;
				indices[index++] = i1;
				indices[index++] = i2;
				indices[index++] = i1;
				indices[index++] = i3;
				indices[index++] = i2;
			}
		}
	}

	return indices;
}

/** CPU reference mesh generation driven by graph evalCPU (not hardcoded surface ids). */
export function evaluateMeshGenCpu(req: MeshGenRequest): GeneratedMesh {
	const { graph, position, normal, gridSize, faceCount } = req;
	if (gridSize < 2) {
		throw new RangeError('gridSize must be >= 2');
	}
	if (faceCount < 1) {
		throw new RangeError('faceCount must be >= 1');
	}

	const vertsPerFace = gridSize * gridSize;
	const vertexCount = vertsPerFace * faceCount;
	const positions = new Float32Array(vertexCount * 3);
	const normals = new Float32Array(vertexCount * 3);
	const faceNodes = findFaceParamNodes(graph);

	let vertex = 0;
	for (let face = 0; face < faceCount; face++) {
		for (let y = 0; y < gridSize; y++) {
			for (let x = 0; x < gridSize; x++) {
				const u = x / (gridSize - 1);
				const v = y / (gridSize - 1);
				const nodeParams: Record<string, Record<string, number | boolean>> = {};
				for (const nodeId of faceNodes) {
					nodeParams[nodeId] = { face };
				}
				const sample = { procedural: { uv: [u, v] as [number, number] }, nodeParams };
				const pos = evaluateGraphVec3Output(graph, position, sample);
				const norm = normal ? evaluateGraphVec3Output(graph, normal, sample) : pos;
				const offset = vertex * 3;
				positions[offset] = pos[0]!;
				positions[offset + 1] = pos[1]!;
				positions[offset + 2] = pos[2]!;
				normals[offset] = norm[0]!;
				normals[offset + 1] = norm[1]!;
				normals[offset + 2] = norm[2]!;
				vertex++;
			}
		}
	}

	const indices = buildMeshIndices(gridSize, faceCount);
	return { positions, normals, indices, vertexCount, indexCount: indices.length };
}

const MESHGEN_POSITION_OUTPUT = '__meshgen_position';
const MESHGEN_NORMAL_OUTPUT = '__meshgen_normal';

function augmentGraphForMeshGen(req: MeshGenRequest): {
	doc: GraphDocument;
	sliceOutputNames: string[];
} {
	let doc = req.graph;
	const sliceOutputNames: string[] = [];

	function ensureOutput(ref: PortRef, syntheticName: string): string {
		const existing = doc.outputs.find(
			(candidate) => candidate.from.node === ref.node && candidate.from.port === ref.port
		);
		if (existing) {
			return existing.name;
		}
		doc = {
			...doc,
			outputs: [...doc.outputs, { name: syntheticName, from: ref }]
		};
		return syntheticName;
	}

	sliceOutputNames.push(ensureOutput(req.position, MESHGEN_POSITION_OUTPUT));
	if (req.normal) {
		sliceOutputNames.push(ensureOutput(req.normal, MESHGEN_NORMAL_OUTPUT));
	}

	return { doc, sliceOutputNames };
}

function mergeMeshGenGraphParams(...fieldSets: GraphParamField[][]): GraphParamField[] {
	const merged = new Map<string, GraphParamField>();
	for (const fields of fieldSets) {
		for (const field of meshGenGraphParams(fields)) {
			merged.set(`${field.nodeId}:${field.paramName}`, field);
		}
	}
	return [...merged.values()];
}

function meshVertexCount(gridSize: number, faceCount: number): number {
	return gridSize * gridSize * faceCount;
}

function meshGenGraphParams(fields: GraphParamField[]): GraphParamField[] {
	return fields.filter((field) => field.paramName !== 'face');
}

function packMeshGenParams(
	gridSize: number,
	faceCount: number,
	fields: GraphParamField[],
	graph: GraphDocument
): Float32Array {
	const values = [gridSize, faceCount];
	for (const field of fields) {
		const node = graph.nodes.find((candidate) => candidate.id === field.nodeId);
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

function buildMeshGenComputeShader(
	moduleCode: string,
	positionBody: string[],
	positionExpr: string,
	normalBody: string[] | null,
	normalExpr: string | null,
	params: GraphParamField[]
): string {
	const paramsStruct = buildParamsStructWgsl(params).replace(
		'struct GraphParams {',
		'struct MeshGenParams {'
	);
	const normalFn =
		normalBody && normalExpr
			? `fn evaluateNormal(u: f32, v: f32, face: i32) -> vec3<f32> {
${normalBody.map((line) => `\t${line}`).join('\n')}
\treturn ${normalExpr};
}`
			: `fn evaluateNormal(u: f32, v: f32, face: i32) -> vec3<f32> {
\treturn evaluatePosition(u, v, face);
}`;

	return `${moduleCode}

${paramsStruct}

@group(0) @binding(0) var<uniform> params: MeshGenParams;
@group(0) @binding(1) var<storage, read_write> out_positions: array<f32>;
@group(0) @binding(2) var<storage, read_write> out_normals: array<f32>;

fn evaluatePosition(u: f32, v: f32, face: i32) -> vec3<f32> {
${positionBody.map((line) => `\t${line}`).join('\n')}
\treturn ${positionExpr};
}

${normalFn}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let gridSize = u32(params.width);
	let faceCount = u32(params.height);
	let vertsPerFace = gridSize * gridSize;
	let vid = gid.x;
	let totalVerts = vertsPerFace * faceCount;
	if (vid >= totalVerts) {
		return;
	}

	let face = i32(vid / vertsPerFace);
	let local = vid % vertsPerFace;
	let x = local % gridSize;
	let y = local / gridSize;
	let u = f32(x) / f32(max(1u, gridSize - 1u));
	let v = f32(y) / f32(max(1u, gridSize - 1u));

	let pos = evaluatePosition(u, v, face);
	let nrm = evaluateNormal(u, v, face);
	let base = vid * 3u;
	out_positions[base + 0u] = pos.x;
	out_positions[base + 1u] = pos.y;
	out_positions[base + 2u] = pos.z;
	out_normals[base + 0u] = nrm.x;
	out_normals[base + 1u] = nrm.y;
	out_normals[base + 2u] = nrm.z;
}
`;
}

/** Assemble the WGSL compute shader for mesh generation. */
export async function assembleMeshGenShader(req: MeshGenRequest): Promise<string> {
	const { doc: augmentedDoc, sliceOutputNames } = augmentGraphForMeshGen(req);
	const slice = sliceGraph(augmentedDoc, { outputs: sliceOutputNames });
	const generated = await generateWgsl(slice, createStandardLibraryResolver());
	const positionEmitted = emitGraphVec3Eval(req.graph, req.position, { faceExpr: 'face' });

	let normalBody: string[] | null = null;
	let normalExpr: string | null = null;
	const paramSources: GraphParamField[][] = [positionEmitted.params];
	if (req.normal) {
		const normalEmitted = emitGraphVec3Eval(req.graph, req.normal, { faceExpr: 'face' });
		normalBody = normalEmitted.body;
		normalExpr = normalEmitted.resultExpr;
		paramSources.push(normalEmitted.params);
	}
	const graphParams = mergeMeshGenGraphParams(...paramSources);

	return buildMeshGenComputeShader(
		generated.code,
		positionEmitted.body,
		positionEmitted.resultExpr,
		normalBody,
		normalExpr,
		graphParams
	);
}

async function readBufferF32(device: GPUDevice, buffer: GPUBuffer, floatCount: number): Promise<Float32Array> {
	const readback = device.createBuffer({
		size: alignTo(floatCount * 4, 4),
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	});
	const encoder = device.createCommandEncoder();
	encoder.copyBufferToBuffer(buffer, 0, readback, 0, floatCount * 4);
	device.queue.submit([encoder.finish()]);
	await device.queue.onSubmittedWorkDone();
	await readback.mapAsync(GPUMapMode.READ);
	const mapped = new Float32Array(readback.getMappedRange().slice(0, floatCount * 4));
	readback.unmap();
	readback.destroy();
	return mapped;
}

/** GPU compute mesh generation; matches CPU reference when a device is present. */
export async function executeMeshGen(device: GPUDevice, req: MeshGenRequest): Promise<GeneratedMesh> {
	const vertexCount = meshVertexCount(req.gridSize, req.faceCount);
	const indices = buildMeshIndices(req.gridSize, req.faceCount);
	const indexCount = indices.length;

	const shaderCode = await assembleMeshGenShader(req);
	const positionEmitted = emitGraphVec3Eval(req.graph, req.position, { faceExpr: 'face' });
	const normalEmitted = req.normal
		? emitGraphVec3Eval(req.graph, req.normal, { faceExpr: 'face' })
		: null;
	const graphParams = mergeMeshGenGraphParams(
		positionEmitted.params,
		normalEmitted?.params ?? []
	);

	const module = device.createShaderModule({ label: 'mesh-gen', code: shaderCode });
	const pipeline = device.createComputePipeline({
		label: 'mesh-gen',
		layout: 'auto',
		compute: { module, entryPoint: 'main' }
	});
	const bindGroupLayout = pipeline.getBindGroupLayout(0);

	const uniformData = packMeshGenParams(req.gridSize, req.faceCount, graphParams, req.graph);
	const uniformBuffer = device.createBuffer({
		label: 'mesh-gen-uniforms',
		size: alignTo(uniformData.byteLength, 16),
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer, uniformData.byteOffset, uniformData.byteLength);

	const positionBytes = vertexCount * 3 * 4;
	const positionBuffer = createStorageBuffer(device, {
		label: 'mesh-gen-positions',
		size: alignTo(positionBytes, 16),
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
	});
	const normalBuffer = createStorageBuffer(device, {
		label: 'mesh-gen-normals',
		size: alignTo(positionBytes, 16),
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
	});

	const bindGroup = device.createBindGroup({
		layout: bindGroupLayout,
		entries: [
			{ binding: 0, resource: { buffer: uniformBuffer } },
			{ binding: 1, resource: { buffer: positionBuffer } },
			{ binding: 2, resource: { buffer: normalBuffer } }
		]
	});

	const workgroups = Math.ceil(vertexCount / 64);
	const encoder = device.createCommandEncoder({ label: 'mesh-gen' });
	const pass = encoder.beginComputePass({ label: 'mesh-gen' });
	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.dispatchWorkgroups(workgroups);
	pass.end();
	device.queue.submit([encoder.finish()]);
	await device.queue.onSubmittedWorkDone();

	const gpuPositions = await readBufferF32(device, positionBuffer, vertexCount * 3);
	const gpuNormals = await readBufferF32(device, normalBuffer, vertexCount * 3);

	uniformBuffer.destroy();
	positionBuffer.destroy();
	normalBuffer.destroy();

	return {
		positions: gpuPositions,
		normals: gpuNormals,
		indices,
		vertexCount,
		indexCount
	};
}
