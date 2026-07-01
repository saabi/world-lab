import '@virtual-planet/graph';
import { describe, expect, it, vi } from 'vitest';
import { effectiveGraphDocument } from '@virtual-planet/graph';
import { planIndependentGraphFramePasses } from '@virtual-planet/runtime-webgpu';

import { animatedWorleyPipelineGraph } from './graphBuilders.js';
import { enumeratePreviewBuffers } from './previewBuffers.js';

const executeMock = vi.fn(async () => ({
	width: 4,
	height: 4,
	targets: {
		n_display: new Uint8Array(64),
		n_target_display_1: new Uint8Array(64)
	}
}));

vi.mock('@virtual-planet/runtime-webgpu', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@virtual-planet/runtime-webgpu')>();
	return {
		...actual,
		requestGpuDevice: vi.fn(async () => ({ adapter: {}, device: {} as GPUDevice })),
		GraphFrameExecutor: class {
			execute = executeMock;
		}
	};
});

describe('single-loop preview integration', () => {
	it('plans two independent targets for the Worley sample', () => {
		const graph = effectiveGraphDocument(animatedWorleyPipelineGraph());
		expect(planIndependentGraphFramePasses(graph).map((pass) => pass.targetId).sort()).toEqual([
			'pipeline_image_n_display',
			'pipeline_image_n_target_display_1'
		]);
	});

	// Regression: the pane looks up snapshot.targets[bufferId], so frame target ids MUST equal
	// the preview buffer ids — otherwise every pane renders blank (silently). This diverged once
	// (executor keyed by display node id, buffers by output name) and produced no error.
	it('frame target ids match the preview buffer ids the panes look up', () => {
		const graph = effectiveGraphDocument(animatedWorleyPipelineGraph());
		const targetIds = planIndependentGraphFramePasses(graph).map((pass) => pass.targetId).sort();
		const bufferIds = enumeratePreviewBuffers(graph)
			.filter((buffer) => buffer.family === 'image')
			.map((buffer) => buffer.id)
			.sort();
		expect(targetIds).toEqual(bufferIds);
	});
});
