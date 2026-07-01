import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { effectiveGraphDocument } from '@virtual-planet/graph';

import { animatedWorleyPipelineGraph } from './graphBuilders.js';

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
		requestGpuDevice: vi.fn(async () => ({
			adapter: {},
			device: { destroy: vi.fn() } as unknown as GPUDevice
		})),
		GraphFrameExecutor: class {
			execute = executeMock;
		}
	};
});

describe('createPreviewFrameLoop', () => {
	beforeEach(() => {
		executeMock.mockClear();
		vi.stubGlobal('navigator', { gpu: {} });
		vi.stubGlobal(
			'requestAnimationFrame',
			(callback: FrameRequestCallback) => {
				queueMicrotask(() => callback(0));
				return 1;
			}
		);
		vi.stubGlobal('cancelAnimationFrame', () => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('exposes the same iTime/iFrame to concurrent subscribers on one tick', async () => {
		const { createPreviewFrameLoop } = await import('./previewFrameLoop.js');
		const graph = effectiveGraphDocument(animatedWorleyPipelineGraph());
		let nowMs = 1000;
		const loop = createPreviewFrameLoop({
			graph,
			compileSignature: 'sig-a',
			width: 4,
			now: () => nowMs
		});

		interface PreviewFrameSnapshot {
			iTime: number;
			iFrame: number;
			width: number;
			height: number;
			targets: Readonly<Record<string, Uint8Array>>;
			error: string | null;
		}

		const seen: PreviewFrameSnapshot[] = [];
		const unsubA = loop.subscribe((snapshot) => seen.push({ ...snapshot, targets: { ...snapshot.targets } }));
		const unsubB = loop.subscribe((snapshot) => seen.push({ ...snapshot, targets: { ...snapshot.targets } }));

		await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
		await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

		unsubA();
		unsubB();
		loop.destroy();

		expect(executeMock).toHaveBeenCalled();
		const host = executeMock.mock.calls[0]?.[0].host;
		expect(host?.iFrame).toBe(0);
		expect(host?.iTime).toBe(0);

		const frames = seen.filter((snapshot) => snapshot.error === null && snapshot.iFrame > 0);
		expect(frames.length).toBeGreaterThan(0);
		const first = frames[0]!;
		for (const snapshot of frames) {
			expect(snapshot.iFrame).toBe(first.iFrame);
			expect(snapshot.iTime).toBe(first.iTime);
		}
	});
});
