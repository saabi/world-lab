import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	BUFFER_FEEDBACK_RESOURCE_ID,
	BufferFeedbackExecutor,
	buildBufferFeedbackPassGraph
} from './bufferFeedback.js';
import { ResourceRealizer } from '../frameGraph/realize.js';
import { shouldSkipWebGPUTest } from '../testSupport/webgpuTestEnv.js';

describe('buffer feedback proof graph', () => {
	afterEach(() => vi.restoreAllMocks());

	it('declares a double-buffered scalar storage resource with seed support', () => {
		const graph = buildBufferFeedbackPassGraph(64);
		expect(graph.targets).toEqual([
			expect.objectContaining({
				id: BUFFER_FEEDBACK_RESOURCE_ID,
				lifetime: { kind: 'history', slots: 2 },
				size: { kind: 'element-count', count: 64 },
				shape: expect.objectContaining({
					kind: 'buffer',
					usages: ['storage', 'copy-dst']
				})
			})
		]);
		expect(graph.passes[0]?.reads).toEqual([
			expect.objectContaining({
				target: BUFFER_FEEDBACK_RESOURCE_ID,
				version: 'previous'
			})
		]);
	});

	it('reuses allocation and seed state while advancing history exactly once per frame', async () => {
		const previous = {} as GPUBuffer;
		const write = {} as GPUBuffer;
		vi.spyOn(ResourceRealizer.prototype, 'realizeAll').mockImplementation(() => {});
		vi.spyOn(ResourceRealizer.prototype, 'resolve').mockReturnValue({
			write,
			readPrevious: previous
		});
		const advance = vi
			.spyOn(ResourceRealizer.prototype, 'advanceFrame')
			.mockImplementation(() => {});
		const texture = {
			createView: vi.fn(() => ({})),
			destroy: vi.fn()
		};
		const readback = {
			mapAsync: vi.fn(async () => {}),
			getMappedRange: vi.fn(() => new ArrayBuffer(256 * 4)),
			unmap: vi.fn(),
			destroy: vi.fn()
		};
		const pass = {
			setPipeline: vi.fn(),
			setBindGroup: vi.fn(),
			draw: vi.fn(),
			end: vi.fn()
		};
		const encoder = {
			beginRenderPass: vi.fn(() => pass),
			copyTextureToBuffer: vi.fn(),
			finish: vi.fn(() => ({}))
		};
		const device = {
			createTexture: vi.fn(() => texture),
			createBuffer: vi.fn(() => readback),
			createShaderModule: vi.fn(() => ({})),
			createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: vi.fn(() => ({})) })),
			createBindGroup: vi.fn(() => ({})),
			createCommandEncoder: vi.fn(() => encoder),
			queue: { writeBuffer: vi.fn(), submit: vi.fn() }
		} as unknown as GPUDevice;
		const executor = new BufferFeedbackExecutor();

		await executor.execute(device, 4, 4);
		await executor.execute(device, 4, 4);

		expect(device.createTexture).toHaveBeenCalledTimes(1);
		expect(device.queue.writeBuffer).toHaveBeenCalledTimes(1);
		expect(advance).toHaveBeenCalledTimes(2);
		executor.dispose();
		expect(texture.destroy).toHaveBeenCalledTimes(1);
	});

	it.skipIf(shouldSkipWebGPUTest())(
		'alternates deterministic history state across real GPU frames',
		async () => {
			const adapter = await navigator.gpu!.requestAdapter();
			expect(adapter).toBeTruthy();
			const device = await adapter!.requestDevice();
			const executor = new BufferFeedbackExecutor();
			try {
				const first = await executor.execute(device, 4, 4);
				const second = await executor.execute(device, 4, 4);
				expect([...first.pixels.slice(0, 4)]).toEqual([255, 255, 255, 255]);
				expect([...second.pixels.slice(0, 4)]).toEqual([0, 0, 0, 255]);
			} finally {
				executor.dispose();
				device.destroy();
			}
		}
	);
});
