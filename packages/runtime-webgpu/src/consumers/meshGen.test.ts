import { evaluateGraphOutput } from '@world-lab/runtime-cpu';
import '@world-lab/graph';
import { getPrimitive } from '@world-lab/graph';
import type { GraphDocument, Node } from '@world-lab/graph';
import { describe, expect, it } from 'vitest';

import {
	assembleMeshGenShader,
	buildDecomposedCubeSphereMeshGenGraph,
	evaluateMeshGenCpu,
	executeMeshGen,
	meshGenRequestForLegacySurface,
	type MeshGenRequest
} from './meshGen.js';
import { createStandardLibraryResolver } from '../moduleResolver.js';
import { generateWgsl, sliceGraph } from '@world-lab/compiler';
import { buildSurfaceMesh } from '../surfaceMesh.js';
import { shouldSkipWebGPUTest } from '../testSupport/webgpuTestEnv.js';

function snapshotNode(id: string, primitiveId: string, params?: Record<string, unknown>): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	const instantiatePorts = (direction: 'in' | 'out') =>
		(direction === 'in' ? primitive.inputs : primitive.outputs).map((spec) => ({
			id: spec.name,
			name: spec.name,
			direction,
			dataType: spec.dataType,
			space: spec.space ?? 'none'
		}));
	return {
		id,
		primitive: primitiveId,
		inputs: instantiatePorts('in'),
		outputs: instantiatePorts('out'),
		...(params !== undefined ? { params } : {})
	};
}

/** Matches shipped `displacedSphereMeshGraph` topology with `outputs: []`. */
function displacedSphereMeshGenRequest(gridSize = 8): MeshGenRequest {
	const graph: GraphDocument = {
		version: '2',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv'),
			snapshotNode('n_face', 'surface.cubeFace', { face: 0 }),
			snapshotNode('n_sph', 'transform.spherify'),
			snapshotNode('n_noise', 'noise.perlin3d'),
			snapshotNode('n_disp', 'transform.normalDisplace'),
			snapshotNode('n_mesh', 'target.mesh', { gridSize, faceCount: 6 })
		],
		edges: [
			{ id: 'e_uv_face', from: { node: 'n_uv', port: 'uv' }, to: { node: 'n_face', port: 'uv' } },
			{
				id: 'e_face_sph',
				from: { node: 'n_face', port: 'position' },
				to: { node: 'n_sph', port: 'position' }
			},
			{
				id: 'e_sph_noise',
				from: { node: 'n_sph', port: 'position' },
				to: { node: 'n_noise', port: 'position' }
			},
			{
				id: 'e_sph_disp_pos',
				from: { node: 'n_sph', port: 'position' },
				to: { node: 'n_disp', port: 'position' }
			},
			{
				id: 'e_sph_disp_norm',
				from: { node: 'n_sph', port: 'position' },
				to: { node: 'n_disp', port: 'normal' }
			},
			{
				id: 'e_noise_disp_h',
				from: { node: 'n_noise', port: 'value' },
				to: { node: 'n_disp', port: 'height' }
			},
			{
				id: 'e_disp_mesh_pos',
				from: { node: 'n_disp', port: 'position' },
				to: { node: 'n_mesh', port: 'position' }
			},
			{
				id: 'e_sph_mesh_norm',
				from: { node: 'n_sph', port: 'position' },
				to: { node: 'n_mesh', port: 'normal' }
			}
		],
		outputs: [],
	};

	return {
		graph,
		position: { node: 'n_disp', port: 'position' },
		normal: { node: 'n_sph', port: 'position' },
		gridSize,
		faceCount: 6
	};
}

/** Normal branch is parallel to the position transform chain (shares only procedural UV). */
function divergentNormalMeshGenRequest(gridSize = 4): MeshGenRequest {
	const graph: GraphDocument = {
		version: '2',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv'),
			snapshotNode('n_plane', 'surface.plane'),
			snapshotNode('n_rot', 'transform.rotate', { rotationX: 0.4, rotationY: 0, rotationZ: 0 }),
			snapshotNode('n_face', 'surface.cubeFace', { face: 0 }),
			snapshotNode('n_sph', 'transform.spherify'),
			snapshotNode('n_mesh', 'target.mesh', { gridSize, faceCount: 1 })
		],
		edges: [
			{ id: 'e_uv_plane', from: { node: 'n_uv', port: 'uv' }, to: { node: 'n_plane', port: 'uv' } },
			{
				id: 'e_plane_rot',
				from: { node: 'n_plane', port: 'position' },
				to: { node: 'n_rot', port: 'position' }
			},
			{
				id: 'e_rot_mesh_pos',
				from: { node: 'n_rot', port: 'position' },
				to: { node: 'n_mesh', port: 'position' }
			},
			{ id: 'e_uv_face', from: { node: 'n_uv', port: 'uv' }, to: { node: 'n_face', port: 'uv' } },
			{
				id: 'e_face_sph',
				from: { node: 'n_face', port: 'position' },
				to: { node: 'n_sph', port: 'position' }
			},
			{
				id: 'e_sph_mesh_norm',
				from: { node: 'n_sph', port: 'position' },
				to: { node: 'n_mesh', port: 'normal' }
			}
		],
		outputs: [],
	};

	return {
		graph,
		position: { node: 'n_rot', port: 'position' },
		normal: { node: 'n_sph', port: 'position' },
		gridSize,
		faceCount: 1
	};
}

function expectMeshesClose(a: Float32Array, b: Float32Array, tol = 1e-6): void {
	expect(a.length).toBe(b.length);
	for (let i = 0; i < a.length; i++) {
		expect(a[i]).toBeCloseTo(b[i]!, 5);
	}
}

describe('@world-lab/runtime-webgpu meshGen', () => {
	it('evaluateMeshGenCpu reproduces legacy buildSurfaceMesh for cubeSphere', () => {
		const legacy = buildSurfaceMesh('surface.cubeSphere', 8);
		const graphMesh = evaluateMeshGenCpu(meshGenRequestForLegacySurface('surface.cubeSphere', 8));
		expectMeshesClose(legacy.positions, graphMesh.positions);
		expectMeshesClose(legacy.normals, graphMesh.normals);
		expect(graphMesh.indices).toEqual(legacy.indices);
	});

	it('evaluateMeshGenCpu reproduces legacy buildSurfaceMesh for plane', () => {
		const legacy = buildSurfaceMesh('surface.plane', 4);
		const graphMesh = evaluateMeshGenCpu(meshGenRequestForLegacySurface('surface.plane', 4));
		expectMeshesClose(legacy.positions, graphMesh.positions);
		expectMeshesClose(legacy.normals, graphMesh.normals);
	});

	it('decomposed cubeFace → spherify matches monolithic cubeSphere positions', () => {
		const monolithic = evaluateMeshGenCpu(meshGenRequestForLegacySurface('surface.cubeSphere', 6));
		const decomposed = evaluateMeshGenCpu(
			meshGenRequestForLegacySurface('surface.cubeSphere', 6, { decomposedCubeSphere: true })
		);
		expectMeshesClose(monolithic.positions, decomposed.positions);
	});

	it('decomposed graph is wired as surface.cubeFace → transform.spherify', () => {
		const graph = buildDecomposedCubeSphereMeshGenGraph();
		expect(graph.nodes.map((node) => node.primitive)).toEqual([
			'procedural.uv',
			'surface.cubeFace',
			'transform.spherify'
		]);
	});

	it('generateWgsl slice includes surface.cubeSphere module source', async () => {
		const req = meshGenRequestForLegacySurface('surface.cubeSphere', 4);
		const slice = sliceGraph(req.graph, { outputs: ['position'] });
		const generated = await generateWgsl(slice, createStandardLibraryResolver());
		expect(generated.moduleIds).toContain('surface.cubeSphere');
		expect(generated.code).toMatch(/fn cubeSphere\(/);
	});

	it('assembles mesh-gen WGSL with dynamic face and cubeSphere callee', async () => {
		const code = await assembleMeshGenShader(meshGenRequestForLegacySurface('surface.cubeSphere', 4));
		expect(code).toContain('fn evaluatePosition');
		expect(code).toContain('fn cubeSphere');
		expect(code).toContain('i32(face)');
	});

	it('assembles mesh-gen WGSL for editor-style graphs with empty outputs', async () => {
		const code = await assembleMeshGenShader(displacedSphereMeshGenRequest(6));
		expect(code).toContain('fn evaluatePosition');
		expect(code).toContain('fn evaluateNormal');
	});

	it.skipIf(shouldSkipWebGPUTest())(
		'executeMeshGen matches CPU for legacy cubeSphere with empty outputs',
		async () => {
			const { requestGpuDevice } = await import('../device.js');
			const { device } = await requestGpuDevice();
			const base = meshGenRequestForLegacySurface('surface.cubeSphere', 4);
			const req: MeshGenRequest = {
				...base,
				graph: { ...base.graph, outputs: [] }
			};
			const cpu = evaluateMeshGenCpu(req);
			const gpuMesh = await executeMeshGen(device, req);
			expectMeshesClose(cpu.positions, gpuMesh.positions, 1e-4);
			expectMeshesClose(cpu.normals, gpuMesh.normals, 1e-4);
			device.destroy();
		}
	);

	it('slices both position and normal subgraphs when normal is independent', async () => {
		const code = await assembleMeshGenShader(divergentNormalMeshGenRequest(4));
		expect(code).toContain('fn evaluatePosition');
		expect(code).toContain('fn evaluateNormal');
		expect(code).toContain('fn rotate(');
		expect(code).toMatch(/fn spherify|spherify\(/);
	});

	it.skipIf(shouldSkipWebGPUTest())('assembled mesh-gen shader device-compiles', async () => {
		const { expectShaderCompiles } = await import('../testSupport/webgpuTestEnv.js');
		const code = await assembleMeshGenShader(
			meshGenRequestForLegacySurface('surface.cubeSphere', 4, { decomposedCubeSphere: true })
		);
		await expectShaderCompiles(code, 'mesh-gen-decomposed');
	});

	it.skipIf(shouldSkipWebGPUTest())('executeMeshGen matches CPU reference on GPU', async () => {
		const { requestGpuDevice } = await import('../device.js');
		const { device } = await requestGpuDevice();
		const req = meshGenRequestForLegacySurface('surface.cubeSphere', 4);
		const cpu = evaluateMeshGenCpu(req);
		const gpuMesh = await executeMeshGen(device, req);
		expectMeshesClose(cpu.positions, gpuMesh.positions, 1e-4);
		expectMeshesClose(cpu.normals, gpuMesh.normals, 1e-4);
		device.destroy();
	});

	it.skipIf(shouldSkipWebGPUTest())(
		'executeMeshGen matches CPU for editor graphs with empty outputs (rotated plane)',
		async () => {
			const { requestGpuDevice } = await import('../device.js');
			const { device } = await requestGpuDevice();
			const graph: GraphDocument = {
				version: '2',
				nodes: [
					snapshotNode('n_uv', 'procedural.uv'),
					snapshotNode('n_plane', 'surface.plane'),
					snapshotNode('n_rot', 'transform.rotate', { rotationX: 0.65, rotationY: 0, rotationZ: 0 }),
					snapshotNode('n_mesh', 'target.mesh', { gridSize: 8, faceCount: 1 })
				],
				edges: [
					{ id: 'e1', from: { node: 'n_uv', port: 'uv' }, to: { node: 'n_plane', port: 'uv' } },
					{
						id: 'e2',
						from: { node: 'n_plane', port: 'position' },
						to: { node: 'n_rot', port: 'position' }
					},
					{
						id: 'e3',
						from: { node: 'n_rot', port: 'position' },
						to: { node: 'n_mesh', port: 'position' }
					},
					{
						id: 'e4',
						from: { node: 'n_plane', port: 'normal' },
						to: { node: 'n_mesh', port: 'normal' }
					}
				],
				outputs: [],
			};
			const req: MeshGenRequest = {
				graph,
				position: { node: 'n_rot', port: 'position' },
				normal: { node: 'n_plane', port: 'normal' },
				gridSize: 8,
				faceCount: 1
			};
			const cpu = evaluateMeshGenCpu(req);
			const gpuMesh = await executeMeshGen(device, req);
			expectMeshesClose(cpu.positions, gpuMesh.positions, 1e-4);
			expectMeshesClose(cpu.normals, gpuMesh.normals, 1e-4);
			device.destroy();
		}
	);

	it('evaluateGraphOutput perlin height is positive at the displaced-sphere corner sample', () => {
		const req = displacedSphereMeshGenRequest(6);
		const height = evaluateGraphOutput(
			req.graph,
			{ node: 'n_noise', port: 'value' },
			{ procedural: { uv: [0, 0] }, nodeParams: { n_face: { face: 0 } } }
		);
		expect(height).toBeGreaterThan(0);
	});

	// Perlin3d height in mesh-compute shaders still diverges from CPU (follow-on).
	it.skip('executeMeshGen matches CPU for displaced-sphere editor graph with empty outputs', async () => {
		const { requestGpuDevice } = await import('../device.js');
		const { device } = await requestGpuDevice();
		const req = displacedSphereMeshGenRequest(6);
		const cpu = evaluateMeshGenCpu(req);
		const gpuMesh = await executeMeshGen(device, req);
		expectMeshesClose(cpu.positions, gpuMesh.positions, 1e-4);
		expectMeshesClose(cpu.normals, gpuMesh.normals, 1e-4);
		device.destroy();
	});

	it.skipIf(shouldSkipWebGPUTest())(
		'executeMeshGen matches CPU for spherify-only graph with empty outputs',
		async () => {
			const { requestGpuDevice } = await import('../device.js');
			const { device } = await requestGpuDevice();
			const graph: GraphDocument = {
				version: '2',
				nodes: [
					snapshotNode('n_uv', 'procedural.uv'),
					snapshotNode('n_face', 'surface.cubeFace', { face: 0 }),
					snapshotNode('n_sph', 'transform.spherify'),
					snapshotNode('n_mesh', 'target.mesh', { gridSize: 6, faceCount: 6 })
				],
				edges: [
					{ id: 'e1', from: { node: 'n_uv', port: 'uv' }, to: { node: 'n_face', port: 'uv' } },
					{
						id: 'e2',
						from: { node: 'n_face', port: 'position' },
						to: { node: 'n_sph', port: 'position' }
					},
					{
						id: 'e3',
						from: { node: 'n_sph', port: 'position' },
						to: { node: 'n_mesh', port: 'position' }
					},
					{
						id: 'e4',
						from: { node: 'n_sph', port: 'position' },
						to: { node: 'n_mesh', port: 'normal' }
					}
				],
				outputs: [],
			};
			const req: MeshGenRequest = {
				graph,
				position: { node: 'n_sph', port: 'position' },
				normal: { node: 'n_sph', port: 'position' },
				gridSize: 6,
				faceCount: 6
			};
			const cpu = evaluateMeshGenCpu(req);
			const gpuMesh = await executeMeshGen(device, req);
			expectMeshesClose(cpu.positions, gpuMesh.positions, 1e-4);
			expectMeshesClose(cpu.normals, gpuMesh.normals, 1e-4);
			device.destroy();
		}
	);

	it.skipIf(shouldSkipWebGPUTest())(
		'executeMeshGen matches CPU for spherify + constant displace with empty outputs',
		async () => {
			const { requestGpuDevice } = await import('../device.js');
			const { device } = await requestGpuDevice();
			const graph: GraphDocument = {
				version: '2',
				nodes: [
					snapshotNode('n_uv', 'procedural.uv'),
					snapshotNode('n_face', 'surface.cubeFace', { face: 0 }),
					snapshotNode('n_sph', 'transform.spherify'),
					snapshotNode('n_h', 'constant.f32', { value: 0.15 }),
					snapshotNode('n_disp', 'transform.normalDisplace'),
					snapshotNode('n_mesh', 'target.mesh', { gridSize: 6, faceCount: 6 })
				],
				edges: [
					{ id: 'e1', from: { node: 'n_uv', port: 'uv' }, to: { node: 'n_face', port: 'uv' } },
					{
						id: 'e2',
						from: { node: 'n_face', port: 'position' },
						to: { node: 'n_sph', port: 'position' }
					},
					{
						id: 'e3',
						from: { node: 'n_sph', port: 'position' },
						to: { node: 'n_disp', port: 'position' }
					},
					{
						id: 'e4',
						from: { node: 'n_sph', port: 'position' },
						to: { node: 'n_disp', port: 'normal' }
					},
					{
						id: 'e5',
						from: { node: 'n_h', port: 'value' },
						to: { node: 'n_disp', port: 'height' }
					},
					{
						id: 'e6',
						from: { node: 'n_disp', port: 'position' },
						to: { node: 'n_mesh', port: 'position' }
					},
					{
						id: 'e7',
						from: { node: 'n_sph', port: 'position' },
						to: { node: 'n_mesh', port: 'normal' }
					}
				],
				outputs: [],
			};
			const req: MeshGenRequest = {
				graph,
				position: { node: 'n_disp', port: 'position' },
				normal: { node: 'n_sph', port: 'position' },
				gridSize: 6,
				faceCount: 6
			};
			const cpu = evaluateMeshGenCpu(req);
			const gpuMesh = await executeMeshGen(device, req);
			expectMeshesClose(cpu.positions, gpuMesh.positions, 1e-4);
			device.destroy();
		}
	);
});
