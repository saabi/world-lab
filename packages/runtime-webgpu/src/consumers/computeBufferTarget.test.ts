import { getPrimitive, type ComputeBufferTargetDescriptor } from '@world-lab/graph';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	COMPUTE_BUFFER_RESOURCE_ID,
	ComputeBufferExecutor,
	buildComputeBufferPassGraph
} from './computeBufferTarget.js';
import { ResourceRealizer } from '../frameGraph/realize.js';
import { shouldSkipWebGPUTest } from '../testSupport/webgpuTestEnv.js';

function target(elementCount: number): ComputeBufferTargetDescriptor {
	const primitive = getPrimitive('target.computeBuffer');
	if (primitive?.implementation.kind !== 'kernel') {
		throw new Error('target.computeBuffer is not registered as a kernel');
	}
	return {
		nodeId: 'n_compute_buffer',
		elementCount,
		bindings: primitive.implementation.bindings
	};
}

function mockDevice() {
	const buffers: Array<GPUBuffer & { destroy: ReturnType<typeof vi.fn> }> = [];
	const makeBuffer = (descriptor: GPUBufferDescriptor) => {
		const buffer = {
			label: descriptor.label,
			size: descriptor.size,
			usage: descriptor.usage,
			mapAsync: vi.fn(async () => {}),
			getMappedRange: vi.fn(() => new ArrayBuffer(descriptor.size)),
			unmap: vi.fn(),
			destroy: vi.fn()
		} as unknown as GPUBuffer & { destroy: ReturnType<typeof vi.fn> };
		buffers.push(buffer);
		return buffer;
	};
	const pass = {
		setPipeline: vi.fn(),
		setBindGroup: vi.fn(),
		dispatchWorkgroups: vi.fn(),
		end: vi.fn()
	};
	const encoder = {
		beginComputePass: vi.fn(() => pass),
		copyBufferToBuffer: vi.fn(),
		finish: vi.fn(() => ({}))
	};
	const pipeline = {
		getBindGroupLayout: vi.fn(() => ({}))
	};
	const device = {
		createBuffer: vi.fn(makeBuffer),
		createShaderModule: vi.fn(() => ({})),
		createComputePipelineAsync: vi.fn(async () => pipeline),
		createBindGroup: vi.fn(() => ({})),
		createCommandEncoder: vi.fn(() => encoder),
		queue: {
			writeBuffer: vi.fn(),
			submit: vi.fn()
		}
	} as unknown as GPUDevice;
	return { device, buffers, pass };
}

describe('compute buffer target consumer', () => {
	afterEach(() => vi.restoreAllMocks());

	it('declares a persistent scalar storage buffer resource', () => {
		const graph = buildComputeBufferPassGraph(20);
		expect(graph.targets).toEqual([
			expect.objectContaining({
				id: COMPUTE_BUFFER_RESOURCE_ID,
				lifetime: { kind: 'persistent' },
				size: { kind: 'element-count', count: 20 },
				shape: expect.objectContaining({
					kind: 'buffer',
					usages: ['storage', 'copy-src', 'copy-dst']
				})
			})
		]);
		expect(graph.passes[0]?.bindings).toEqual([
			{ resourceId: COMPUTE_BUFFER_RESOURCE_ID, access: 'read-write' }
		]);
	});

	it('reuses allocation and seed state while advancing once per frame', async () => {
		const advance = vi
			.spyOn(ResourceRealizer.prototype, 'advanceFrame')
			.mockImplementation(() => {});
		const mock = mockDevice();
		const executor = new ComputeBufferExecutor();

		await executor.execute(mock.device, target(20));
		await executor.execute(mock.device, target(20));

		expect(mock.device.createBuffer).toHaveBeenCalledTimes(3);
		expect(mock.device.queue.writeBuffer).toHaveBeenCalledTimes(1);
		expect(advance).toHaveBeenCalledTimes(2);
		expect(mock.pass.dispatchWorkgroups).toHaveBeenCalledWith(3, 1, 1);
	});

	it('rebuilds and disposes the persistent allocation when elementCount changes', async () => {
		const mock = mockDevice();
		const executor = new ComputeBufferExecutor();

		await executor.execute(mock.device, target(20));
		const firstPersistent = mock.buffers[0]!;
		await executor.execute(mock.device, target(10));

		expect(firstPersistent.destroy).toHaveBeenCalledTimes(1);
		expect(mock.device.queue.writeBuffer).toHaveBeenCalledTimes(2);
	});

	it('disposes realized resources and resets seed state', async () => {
		const mock = mockDevice();
		const executor = new ComputeBufferExecutor();

		await executor.execute(mock.device, target(4));
		const persistent = mock.buffers[0]!;
		executor.dispose();
		await executor.execute(mock.device, target(4));

		expect(persistent.destroy).toHaveBeenCalledTimes(1);
		expect(mock.device.queue.writeBuffer).toHaveBeenCalledTimes(2);
	});

	it.skipIf(shouldSkipWebGPUTest())('doubles a persistent buffer on a real device', async () => {
		const adapter = await navigator.gpu!.requestAdapter();
		expect(adapter).toBeTruthy();
		const device = await adapter!.requestDevice();
		const executor = new ComputeBufferExecutor();
		try {
			const first = await executor.execute(device, target(20));
			const second = await executor.execute(device, target(20));
			expect([...first.values]).toEqual([
				2, 4, 6, 8, 10, 12, 14, 16, 18, 20,
				22, 24, 26, 28, 30, 32, 34, 36, 38, 40
			]);
			expect([...second.values]).toEqual([
				4, 8, 12, 16, 20, 24, 28, 32, 36, 40,
				44, 48, 52, 56, 60, 64, 68, 72, 76, 80
			]);
		} finally {
			executor.dispose();
			device.destroy();
		}
	});
});
