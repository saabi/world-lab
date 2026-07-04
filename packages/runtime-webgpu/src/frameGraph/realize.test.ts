import { describe, expect, it, vi } from 'vitest';
import type { TypeRef } from '@world-lab/graph';

import { requestGpuDevice } from '../device.js';
import {
	inferTextureUsage,
	ResourceRealizer,
	resolveBufferByteSize
} from './realize.js';
import type {
	BufferResourceTarget,
	PassGraph,
	TextureResourceTarget
} from './types.js';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

interface MockPhysicalResource {
	readonly serial: number;
	destroy: ReturnType<typeof vi.fn>;
}

function mockDevice() {
	let serial = 0;
	const resources: MockPhysicalResource[] = [];
	const makeResource = () => {
		const resource = { serial: serial++, destroy: vi.fn() };
		resources.push(resource);
		return resource;
	};
	const createBuffer = vi.fn((_descriptor: GPUBufferDescriptor) =>
		makeResource() as unknown as GPUBuffer
	);
	const createTexture = vi.fn((_descriptor: GPUTextureDescriptor) =>
		makeResource() as unknown as GPUTexture
	);
	return {
		device: { createBuffer, createTexture } as unknown as GPUDevice,
		createBuffer,
		createTexture,
		resources
	};
}

function bufferTarget(
	id: string,
	options: {
		lifetime?: BufferResourceTarget['lifetime'];
		usages?: BufferResourceTarget['shape']['usages'];
		element?: BufferResourceTarget['shape']['element'];
		count?: number;
	} = {}
): BufferResourceTarget {
	return {
		id,
		shape: {
			kind: 'buffer',
			element: options.element ?? { kind: 'scalar', scalar: 'f32' },
			access: 'read-write',
			usages: options.usages ?? ['storage']
		},
		lifetime: options.lifetime ?? { kind: 'transient' },
		size: { kind: 'element-count', count: options.count ?? 16 }
	};
}

function textureTarget(
	id: string,
	options: {
		lifetime?: TextureResourceTarget['lifetime'];
		format?: string;
		dimension?: TextureResourceTarget['shape']['dimension'];
		access?: TextureResourceTarget['shape']['access'];
		scale?: number;
	} = {}
): TextureResourceTarget {
	return {
		id,
		shape: {
			kind: 'texture',
			dimension: options.dimension ?? '2d',
			sample: 'float',
			format: options.format ?? 'rgba8unorm',
			...(options.access !== undefined ? { access: options.access } : {})
		},
		lifetime: options.lifetime ?? { kind: 'transient' },
		size: { kind: 'screen-relative', scale: options.scale ?? 1 }
	};
}

function graph(
	targets: PassGraph['targets'],
	passes: PassGraph['passes'],
	display = ''
): PassGraph {
	return { targets, passes, display };
}

describe('ResourceRealizer allocation and caching', () => {
	it('reuses unchanged transient and persistent allocations', () => {
		const mock = mockDevice();
		const realizer = new ResourceRealizer(mock.device);
		const passGraph = graph(
			[
				bufferTarget('buffer', { lifetime: { kind: 'persistent' } }),
				textureTarget('texture')
			],
			[
				{ consumerId: 'buffer-pass', writeTarget: 'buffer', reads: [] },
				{ consumerId: 'texture-pass', writeTarget: 'texture', reads: [] }
			],
			'texture'
		);

		realizer.realizeAll(passGraph, { width: 32, height: 32 });
		const firstBuffer = realizer.resolve('buffer').write;
		const firstTexture = realizer.resolve('texture').write;
		realizer.realizeAll(passGraph, { width: 32, height: 32 });

		expect(realizer.resolve('buffer').write).toBe(firstBuffer);
		expect(realizer.resolve('texture').write).toBe(firstTexture);
		expect(mock.createBuffer).toHaveBeenCalledTimes(1);
		expect(mock.createTexture).toHaveBeenCalledTimes(1);
	});

	it('double-buffers history and swaps current/previous slots', () => {
		const mock = mockDevice();
		const realizer = new ResourceRealizer(mock.device);
		realizer.realizeAll(
			graph(
				[bufferTarget('history', { lifetime: { kind: 'history', slots: 2 } })],
				[{ consumerId: 'update', writeTarget: 'history', reads: [] }]
			),
			{ width: 1, height: 1 }
		);

		const first = realizer.resolve('history');
		expect(first.readPrevious).toBeDefined();
		expect(first.write).not.toBe(first.readPrevious);
		realizer.advanceFrame();
		const second = realizer.resolve('history');
		expect(second.write).toBe(first.readPrevious);
		expect(second.readPrevious).toBe(first.write);
		expect(mock.createBuffer).toHaveBeenCalledTimes(2);
	});

	it('does not expose previous storage for single-slot lifetimes', () => {
		const mock = mockDevice();
		const realizer = new ResourceRealizer(mock.device);
		realizer.realizeAll(
			graph(
				[
					bufferTarget('transient'),
					bufferTarget('persistent', { lifetime: { kind: 'persistent' } })
				],
				[
					{ consumerId: 'a', writeTarget: 'transient', reads: [] },
					{ consumerId: 'b', writeTarget: 'persistent', reads: [] }
				]
			),
			{ width: 1, height: 1 }
		);
		expect(realizer.resolve('transient').readPrevious).toBeUndefined();
		expect(realizer.resolve('persistent').readPrevious).toBeUndefined();
	});

	it('reallocates a resized texture and destroys the old allocation', () => {
		const mock = mockDevice();
		const realizer = new ResourceRealizer(mock.device);
		const passGraph = graph(
			[textureTarget('image')],
			[{ consumerId: 'draw', writeTarget: 'image', reads: [] }],
			'image'
		);
		realizer.realizeAll(passGraph, { width: 32, height: 16 });
		const old = realizer.resolve('image').write as unknown as MockPhysicalResource;
		realizer.realizeAll(passGraph, { width: 64, height: 16 });

		expect(old.destroy).toHaveBeenCalledOnce();
		expect(realizer.resolve('image').write).not.toBe(old);
		expect(mock.createTexture.mock.calls[1]?.[0].size).toEqual([64, 16]);
	});

	it('reallocates when binding-derived buffer usage changes', () => {
		const mock = mockDevice();
		const realizer = new ResourceRealizer(mock.device);
		const target = bufferTarget('state', { usages: ['uniform'] });
		const initial = graph(
			[target],
			[{ consumerId: 'update', writeTarget: 'state', reads: [] }]
		);
		realizer.realizeAll(initial, { width: 1, height: 1 });
		const old = realizer.resolve('state').write as unknown as MockPhysicalResource;

		const widened = graph(
			[target],
			[
				{
					consumerId: 'update',
					writeTarget: 'state',
					reads: [],
					bindings: [{ resourceId: 'state', access: 'write' }]
				}
			]
		);
		realizer.realizeAll(widened, { width: 1, height: 1 });

		const firstUsage = mock.createBuffer.mock.calls[0]?.[0].usage ?? 0;
		const secondUsage = mock.createBuffer.mock.calls[1]?.[0].usage ?? 0;
		expect(firstUsage & GPUBufferUsage.UNIFORM).toBeTruthy();
		expect(firstUsage & GPUBufferUsage.STORAGE).toBeFalsy();
		expect(secondUsage & GPUBufferUsage.UNIFORM).toBeTruthy();
		expect(secondUsage & GPUBufferUsage.STORAGE).toBeTruthy();
		expect(old.destroy).toHaveBeenCalledOnce();
	});

	it('reallocates when texture format changes at the same size', () => {
		const mock = mockDevice();
		const realizer = new ResourceRealizer(mock.device);
		const passes = [{ consumerId: 'draw', writeTarget: 'image', reads: [] }];
		realizer.realizeAll(
			graph([textureTarget('image')], passes, 'image'),
			{ width: 16, height: 16 }
		);
		const old = realizer.resolve('image').write as unknown as MockPhysicalResource;
		realizer.realizeAll(
			graph([textureTarget('image', { format: 'bgra8unorm' })], passes, 'image'),
			{ width: 16, height: 16 }
		);
		expect(old.destroy).toHaveBeenCalledOnce();
		expect(mock.createTexture.mock.calls[1]?.[0].format).toBe('bgra8unorm');
	});

	it('destroys and prunes targets removed from the graph', () => {
		const mock = mockDevice();
		const realizer = new ResourceRealizer(mock.device);
		realizer.realizeAll(
			graph(
				[bufferTarget('removed')],
				[{ consumerId: 'write', writeTarget: 'removed', reads: [] }]
			),
			{ width: 1, height: 1 }
		);
		const removed = realizer.resolve('removed').write as unknown as MockPhysicalResource;
		realizer.realizeAll(graph([], []), { width: 1, height: 1 });
		expect(removed.destroy).toHaveBeenCalledOnce();
		expect(() => realizer.resolve('removed')).toThrow(/not been realized/);
	});

	it('rejects zero-usage buffers before allocation', () => {
		const mock = mockDevice();
		const realizer = new ResourceRealizer(mock.device);
		expect(() =>
			realizer.realizeAll(
				graph(
					[bufferTarget('unused', { usages: [] })],
					[{ consumerId: 'pass', writeTarget: 'unused', reads: [] }]
				),
				{ width: 1, height: 1 }
			)
		).toThrow(/zero buffer usage/i);
		expect(mock.createBuffer).not.toHaveBeenCalled();
	});

	it('rejects zero-usage and storage textures before allocation', () => {
		const zeroMock = mockDevice();
		expect(() =>
			new ResourceRealizer(zeroMock.device).realizeAll(
				graph([textureTarget('unused')], []),
				{ width: 1, height: 1 }
			)
		).toThrow(/zero texture usage/i);
		expect(zeroMock.createTexture).not.toHaveBeenCalled();

		const storageMock = mockDevice();
		expect(() =>
			new ResourceRealizer(storageMock.device).realizeAll(
				graph(
					[textureTarget('storage', { access: 'write' })],
					[{ consumerId: 'compute', writeTarget: 'storage', reads: [] }]
				),
				{ width: 1, height: 1 }
			)
		).toThrow(/storage textures.*deferred/i);
		expect(storageMock.createTexture).not.toHaveBeenCalled();
	});

	it('disposes every slot exactly once and clears resolution state', () => {
		const mock = mockDevice();
		const realizer = new ResourceRealizer(mock.device);
		realizer.realizeAll(
			graph(
				[
					bufferTarget('history', { lifetime: { kind: 'history', slots: 2 } }),
					textureTarget('image')
				],
				[
					{ consumerId: 'update', writeTarget: 'history', reads: [] },
					{ consumerId: 'draw', writeTarget: 'image', reads: [] }
				],
				'image'
			),
			{ width: 8, height: 8 }
		);
		realizer.dispose();
		for (const resource of mock.resources) {
			expect(resource.destroy).toHaveBeenCalledOnce();
		}
		expect(() => realizer.resolve('history')).toThrow(/not been realized/);
	});
});

describe('resource descriptor derivation', () => {
	it('combines declared and binding-derived buffer usage', () => {
		const mock = mockDevice();
		const realizer = new ResourceRealizer(mock.device);
		realizer.realizeAll(
			graph(
				[bufferTarget('state', { usages: ['uniform'] })],
				[
					{
						consumerId: 'update',
						writeTarget: 'state',
						reads: [],
						bindings: [{ resourceId: 'state', access: 'write' }]
					}
				]
			),
			{ width: 1, height: 1 }
		);
		const usage = mock.createBuffer.mock.calls[0]?.[0].usage ?? 0;
		expect(usage & GPUBufferUsage.UNIFORM).toBeTruthy();
		expect(usage & GPUBufferUsage.STORAGE).toBeTruthy();
	});

	it('infers write, read, display, and read-only texture usage', () => {
		const targets = [
			textureTarget('source'),
			textureTarget('display'),
			textureTarget('read-only')
		];
		const passGraph = graph(
			targets,
			[
				{ consumerId: 'source-pass', writeTarget: 'source', reads: [] },
				{
					consumerId: 'display-pass',
					writeTarget: 'display',
					reads: [
						{ channel: 0, target: 'source' },
						{ channel: 1, target: 'read-only' }
					]
				}
			],
			'display'
		);
		expect(inferTextureUsage(passGraph, 'source')).toBe(
			GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
		);
		expect(inferTextureUsage(passGraph, 'display')).toBe(
			GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
		);
		expect(inferTextureUsage(passGraph, 'read-only')).toBe(
			GPUTextureUsage.TEXTURE_BINDING
		);
	});

	it('sizes supported scalar buffers and rejects aggregate elements', () => {
		for (const scalar of ['f32', 'i32', 'u32'] as const) {
			expect(
				resolveBufferByteSize(
					{ ...bufferTarget('x').shape, element: { kind: 'scalar', scalar } },
					3
				)
			).toBe(12);
		}
		expect(
			resolveBufferByteSize(
				{ ...bufferTarget('x').shape, element: { kind: 'scalar', scalar: 'f16' } },
				3
			)
		).toBe(8);

		const unsupportedElements: TypeRef[] = [
			{ kind: 'vector', element: 'f32', width: 3 },
			{ kind: 'matrix', element: 'f32', columns: 2, rows: 2 },
			{ kind: 'array', element: { kind: 'scalar', scalar: 'f32' }, length: 2 },
			{ kind: 'struct', id: 'Pair', fields: [] }
		];
		for (const element of unsupportedElements) {
			expect(() =>
				resolveBufferByteSize({ ...bufferTarget('x').shape, element }, 1)
			).toThrow(/not yet supported/i);
		}
	});

	it('rejects non-2d texture allocation', () => {
		const mock = mockDevice();
		expect(() =>
			new ResourceRealizer(mock.device).realizeAll(
				graph(
					[textureTarget('volume', { dimension: '3d' })],
					[{ consumerId: 'draw', writeTarget: 'volume', reads: [] }]
				),
				{ width: 8, height: 8 }
			)
		).toThrow(/dimension.*not yet supported/i);
		expect(mock.createTexture).not.toHaveBeenCalled();
	});
});

it.skipIf(!hasWebGPU)('realizes a mixed graph on a WebGPU device', async () => {
	const { device } = await requestGpuDevice();
	const realizer = new ResourceRealizer(device);
	try {
		realizer.realizeAll(
			graph(
				[
					bufferTarget('buffer'),
					textureTarget('image'),
					bufferTarget('history', { lifetime: { kind: 'history', slots: 2 } })
				],
				[
					{ consumerId: 'buffer-pass', writeTarget: 'buffer', reads: [] },
					{ consumerId: 'image-pass', writeTarget: 'image', reads: [] },
					{ consumerId: 'history-pass', writeTarget: 'history', reads: [] }
				],
				'image'
			),
			{ width: 8, height: 8 }
		);
		expect(realizer.resolve('buffer').write).toBeDefined();
		expect(realizer.resolve('image').write).toBeDefined();
		expect(realizer.resolve('history').readPrevious).toBeDefined();
	} finally {
		realizer.dispose();
		device.destroy();
	}
});
