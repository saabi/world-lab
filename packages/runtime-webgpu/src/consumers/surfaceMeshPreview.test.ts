import { describe, expect, it, vi } from 'vitest';
import { buildSurfaceMesh } from '../surfaceMesh.js';
import { renderMeshGenPreview, renderSurfaceMeshPreview } from './surfaceMeshPreview.js';
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
});
