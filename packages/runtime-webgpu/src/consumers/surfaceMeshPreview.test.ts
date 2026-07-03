import { describe, expect, it, vi } from 'vitest';
import { buildSurfaceMesh } from '../surfaceMesh.js';
import {
	DEFAULT_MESH_PREVIEW_CAMERA,
	buildWireframeIndices,
	meshPreviewCameraEye,
	meshPreviewViewProjection,
	renderMeshGenPreview,
	renderSurfaceMeshPreview
} from './surfaceMeshPreview.js';
import { meshGenRequestForLegacySurface } from './meshGen.js';
import { shouldSkipWebGpuCanvasTest, shouldSkipWebGPUTest } from '../testSupport/webgpuTestEnv.js';

vi.mock('./meshGen.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./meshGen.js')>();
	return {
		...actual,
		executeMeshGen: vi.fn(actual.executeMeshGen)
	};
});

describe('@world-lab/runtime-webgpu surfaceMeshPreview', () => {
	it('deduplicates shared triangle edges for wireframe rendering', () => {
		const triangles = new Uint32Array([
			0, 1, 2,
			2, 1, 3
		]);
		expect(Array.from(buildWireframeIndices(triangles))).toEqual([
			0, 1,
			1, 2,
			0, 2,
			1, 3,
			2, 3
		]);
	});

	it('preserves the legacy default orbit view', () => {
		const eye = meshPreviewCameraEye(DEFAULT_MESH_PREVIEW_CAMERA);
		expect(eye[0]).toBeCloseTo(2.2, 5);
		expect(eye[1]).toBeCloseTo(1.6, 5);
		expect(eye[2]).toBeCloseTo(2.2, 5);
	});

	it('updates the view-projection matrix when yaw or dolly changes', () => {
		const base = meshPreviewViewProjection(1, DEFAULT_MESH_PREVIEW_CAMERA);
		const rotated = meshPreviewViewProjection(1, {
			...DEFAULT_MESH_PREVIEW_CAMERA,
			yaw: DEFAULT_MESH_PREVIEW_CAMERA.yaw + 0.4
		});
		const zoomed = meshPreviewViewProjection(1, {
			...DEFAULT_MESH_PREVIEW_CAMERA,
			distance: DEFAULT_MESH_PREVIEW_CAMERA.distance * 0.5
		});

		expect(Array.from(rotated)).not.toEqual(Array.from(base));
		expect(Array.from(zoomed)).not.toEqual(Array.from(base));
	});

	it.skipIf(shouldSkipWebGpuCanvasTest())(
		'logs a warning before CPU fallback when GPU mesh generation fails',
		async () => {
			const { executeMeshGen } = await import('./meshGen.js');
			vi.mocked(executeMeshGen).mockRejectedValueOnce(new Error('forced GPU failure'));

			const { requestGpuDevice } = await import('../device.js');
			const { device } = await requestGpuDevice();
			const canvas = document.createElement('canvas');
			canvas.width = 32;
			canvas.height = 32;

			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

			await renderMeshGenPreview({
				device,
				canvas,
				request: meshGenRequestForLegacySurface('surface.plane', 4)
			});

			expect(warn).toHaveBeenCalledWith(
				'Mesh preview GPU path failed; falling back to CPU mesh generation.',
				expect.any(Error)
			);

			warn.mockRestore();
			device.destroy();
		}
	);

	it.skipIf(shouldSkipWebGpuCanvasTest())('renders plane and cube-sphere meshes with different topology', async () => {
		const adapter = await navigator.gpu.requestAdapter();
		expect(adapter).toBeTruthy();
		const device = await adapter!.requestDevice();

		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;

		await renderSurfaceMeshPreview({ device, canvas, surfaceId: 'surface.plane', gridSize: 4 });
		const planeMesh = buildSurfaceMesh('surface.plane', 4);

		await renderSurfaceMeshPreview({ device, canvas, surfaceId: 'surface.cubeSphere', gridSize: 4 });
		const sphereMesh = buildSurfaceMesh('surface.cubeSphere', 4);

		expect(sphereMesh.vertexCount).toBeGreaterThan(planeMesh.vertexCount);
		device.destroy();
	});

	it.skipIf(shouldSkipWebGpuCanvasTest())('renders wireframe mode without reconfiguring the mesh request', async () => {
		const adapter = await navigator.gpu.requestAdapter();
		expect(adapter).toBeTruthy();
		const device = await adapter!.requestDevice();

		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;

		await renderMeshGenPreview({
			device,
			canvas,
			request: meshGenRequestForLegacySurface('surface.plane', 4),
			renderMode: 'wireframe'
		});

		device.destroy();
	});
});
