import '@world-lab/graph';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { GraphDocument } from '@world-lab/graph';

import MeshPreviewPanel from './MeshPreviewPanel.svelte';
import type { MeshTargetDescriptor } from './previewBuffers.js';

const { renderMeshGenPreview, requestGpuDevice } = vi.hoisted(() => ({
	renderMeshGenPreview: vi.fn(async () => undefined),
	requestGpuDevice: vi.fn(async () => ({ device: {} as GPUDevice }))
}));

vi.mock('@world-lab/runtime-webgpu', () => ({
	DEFAULT_MESH_PREVIEW_CAMERA: {
		yaw: Math.atan2(2.2, 2.2),
		pitch: Math.asin(1.6 / Math.hypot(2.2, 1.6, 2.2)),
		distance: Math.hypot(2.2, 1.6, 2.2)
	},
	clampMeshPreviewPitch: (value: number) => value,
	renderMeshGenPreview,
	requestGpuDevice
}));

const emptyGraph: GraphDocument = {
	version: '2',
	nodes: [],
	edges: [],
	outputs: [],
};

const meshRequest: MeshTargetDescriptor = {
	meshNodeId: 'n_mesh',
	position: { node: 'n_plane', port: 'position' },
	normal: { node: 'n_plane', port: 'normal' },
	gridSize: 12,
	faceCount: 1
};

describe('MeshPreviewPanel', () => {
	it('shows empty state when meshRequest is null', () => {
		const { getByText } = render(MeshPreviewPanel, {
			props: { graph: emptyGraph, meshRequest: null }
		});
		expect(getByText(/Wire a mesh target/)).toBeTruthy();
	});

	it('calls mesh-gen preview when meshRequest is provided', async () => {
		renderMeshGenPreview.mockClear();
		requestGpuDevice.mockClear();
		vi.stubGlobal('navigator', { ...navigator, gpu: {} });

		const { container } = render(MeshPreviewPanel, {
			props: { graph: emptyGraph, meshRequest, refreshEpoch: 1 }
		});

		await waitFor(() => {
			expect(requestGpuDevice).toHaveBeenCalled();
			expect(renderMeshGenPreview).toHaveBeenCalledWith(
				expect.objectContaining({
					request: {
						graph: emptyGraph,
						position: meshRequest.position,
						normal: meshRequest.normal,
						gridSize: 12,
						faceCount: 1
					},
					renderMode: 'solid',
					camera: expect.objectContaining({
						yaw: expect.any(Number),
						pitch: expect.any(Number),
						distance: expect.any(Number)
					})
				})
			);
		});

		const calls = renderMeshGenPreview.mock.calls as unknown as Array<[Record<string, unknown>]>;
		const initialCall = calls[calls.length - 1]?.[0];
		expect(initialCall?.renderMode).toBe('solid');

		const wireframeToggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
		await fireEvent.change(wireframeToggle, { target: { checked: true } });
		expect(wireframeToggle.checked).toBe(true);
		await waitFor(() => {
			const wireframeCalls =
				renderMeshGenPreview.mock.calls as unknown as Array<[Record<string, unknown>]>;
			const wireframeCall = wireframeCalls[wireframeCalls.length - 1]?.[0];
			expect(wireframeCall?.renderMode).toBe('wireframe');
		});

		const canvas = container.querySelector('canvas') as HTMLCanvasElement;
		await fireEvent.wheel(canvas, { deltaY: -120 });
		await waitFor(() => {
			const wheelCalls = renderMeshGenPreview.mock.calls as unknown as Array<
				[
					{
						camera: { distance: number };
					}
				]
			>;
			const wheelCall = wheelCalls[wheelCalls.length - 1]?.[0];
			expect(wheelCall?.camera.distance).toBeLessThan(
				(initialCall as { camera?: { distance?: number } } | undefined)?.camera?.distance ??
					Infinity
			);
		});

		vi.unstubAllGlobals();
	});
});
