import '@world-lab/graph';
import { describe, expect, it } from 'vitest';

import {
	assembleMeshGenShader,
	buildDecomposedCubeSphereMeshGenGraph,
	evaluateMeshGenCpu,
	executeMeshGen,
	meshGenRequestForLegacySurface
} from './meshGen.js';
import { createStandardLibraryResolver } from '../moduleResolver.js';
import { generateWgsl, sliceGraph } from '@world-lab/compiler';
import { buildSurfaceMesh } from '../surfaceMesh.js';
import { shouldSkipWebGPUTest } from '../testSupport/webgpuTestEnv.js';

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
});
