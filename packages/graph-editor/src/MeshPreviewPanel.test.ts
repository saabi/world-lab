import '@world-lab/graph';
import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { GraphDocument } from '@world-lab/graph';

import MeshPreviewPanel from './MeshPreviewPanel.svelte';
import type { MeshTargetDescriptor } from './previewBuffers.js';

const { renderMeshGenPreview, requestGpuDevice } = vi.hoisted(() => ({
	renderMeshGenPreview: vi.fn(async () => undefined),
	requestGpuDevice: vi.fn(async () => ({ device: {} as GPUDevice }))
}));

vi.mock('@world-lab/runtime-webgpu', () => ({
	renderMeshGenPreview,
	requestGpuDevice
}));

const emptyGraph: GraphDocument = {
	version: '1',
	nodes: [],
	edges: [],
	outputs: [],
	consumers: []
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

		render(MeshPreviewPanel, {
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
					}
				})
			);
		});

		vi.unstubAllGlobals();
	});
});
