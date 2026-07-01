import '@virtual-planet/graph';
import { describe, expect, it, vi } from 'vitest';
import { effectiveGraphDocument } from '@virtual-planet/graph';

import { GraphFrameExecutor } from './graphFrameExecutor.js';
import { PipelineGraphExecutor } from './pipelineGraph.js';
import { cosinePalettePipelineGraph } from '../test/sampleGraphs.js';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

describe('GraphFrameExecutor', () => {
	it('passes the same iTime and iFrame to every pass in a frame', async () => {
		const executeSpy = vi
			.spyOn(PipelineGraphExecutor.prototype, 'execute')
			.mockResolvedValue({ width: 4, height: 4, pixels: new Uint8Array(64) });

		const graph = effectiveGraphDocument(cosinePalettePipelineGraph());
		const executor = new GraphFrameExecutor();
		await executor.execute({
			device: {} as GPUDevice,
			graph,
			width: 4,
			height: 4,
			host: {
				iTime: 1.25,
				iFrame: 7,
				pointers: { image: [0.5, 0.5, 0, 0] }
			}
		});

		expect(executeSpy).toHaveBeenCalledTimes(1);
		expect(executeSpy.mock.calls[0]?.[0].host).toEqual({
			iTime: 1.25,
			iFrame: 7,
			iMouse: [0.5, 0.5, 0, 0]
		});
		executeSpy.mockRestore();
	});

	it.skipIf(!hasWebGPU)('renders all independent targets on a device', async () => {
		const { requestGpuDevice } = await import('./device.js');
		const { device } = await requestGpuDevice();
		const graph = effectiveGraphDocument(cosinePalettePipelineGraph());
		const result = await new GraphFrameExecutor().execute({
			device,
			graph,
			width: 32,
			height: 32,
			host: { iTime: 0.5, iFrame: 1, pointers: {} }
		});
		expect(Object.keys(result.targets)).toEqual(['image']);
		expect(result.targets.image?.length).toBe(32 * 32 * 4);
		device.destroy();
	});
});
