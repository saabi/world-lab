import type { GraphDocument } from '@virtual-planet/graph';
import {
	GraphFrameExecutor,
	planIndependentGraphFramePasses,
	requestGpuDevice,
	type PreviewPointer
} from '@virtual-planet/runtime-webgpu';

export type { PreviewPointer };

export interface PreviewFrameSnapshot {
	iTime: number;
	iFrame: number;
	width: number;
	height: number;
	targets: Readonly<Record<string, Uint8Array>>;
	error: string | null;
}

export interface PreviewFrameLoop {
	subscribe(listener: (snapshot: PreviewFrameSnapshot) => void): () => void;
	setPointer(targetId: string, pointer: PreviewPointer): void;
	getSnapshot(): PreviewFrameSnapshot | null;
	destroy(): void;
}

export interface PreviewFrameLoopOptions {
	graph: GraphDocument;
	compileSignature: string;
	width?: number;
	now?: () => number;
}

const webGpuAvailable =
	typeof navigator !== 'undefined' && typeof navigator.gpu !== 'undefined';

export function createPreviewFrameLoop(options: PreviewFrameLoopOptions): PreviewFrameLoop {
	const width = options.width ?? 256;
	const now = options.now ?? (() => performance.now());
	const startTime = now();
	let iFrame = 0;
	let snapshot: PreviewFrameSnapshot | null = null;
	const pointers: Record<string, PreviewPointer> = {};
	const listeners = new Set<(snapshot: PreviewFrameSnapshot) => void>();
	let destroyed = false;
	let rafId = 0;
	let device: GPUDevice | null = null;
	let executor = new GraphFrameExecutor();
	let inFlight = false;

	function emit(next: PreviewFrameSnapshot) {
		snapshot = next;
		for (const listener of listeners) {
			listener(next);
		}
	}

	async function tick() {
		if (destroyed) return;
		rafId = requestAnimationFrame(() => {
			void tick();
		});
		if (inFlight) return;

		const passes = planIndependentGraphFramePasses(options.graph);
		if (passes.length === 0) {
			emit({
				iTime: 0,
				iFrame: 0,
				width,
				height: width,
				targets: {},
				error: 'No pipeline preview targets'
			});
			return;
		}

		if (!webGpuAvailable) {
			emit({
				iTime: 0,
				iFrame: 0,
				width,
				height: width,
				targets: {},
				error: 'WebGPU is not available in this browser.'
			});
			return;
		}

		inFlight = true;
		try {
			if (!device) {
				device = (await requestGpuDevice()).device;
			}

			const iTime = (now() - startTime) / 1000;
			const result = await executor.execute({
				device,
				graph: options.graph,
				width,
				height: width,
				host: { iTime, iFrame, pointers: { ...pointers } }
			});
			iFrame++;
			emit({
				iTime,
				iFrame,
				width: result.width,
				height: result.height,
				targets: result.targets,
				error: null
			});
		} catch (error) {
			emit({
				iTime: (now() - startTime) / 1000,
				iFrame,
				width,
				height: width,
				targets: {},
				error: error instanceof Error ? error.message : 'Preview frame failed.'
			});
		} finally {
			inFlight = false;
		}
	}

	rafId = requestAnimationFrame(() => {
		void tick();
	});

	return {
		subscribe(listener) {
			listeners.add(listener);
			if (snapshot) listener(snapshot);
			return () => listeners.delete(listener);
		},
		setPointer(targetId, pointer) {
			pointers[targetId] = pointer;
		},
		getSnapshot() {
			return snapshot;
		},
		destroy() {
			destroyed = true;
			cancelAnimationFrame(rafId);
			listeners.clear();
			device?.destroy();
			device = null;
			executor = new GraphFrameExecutor();
		}
	};
}

/** Blit RGBA8 pixels onto a 2D canvas. */
export function blitPreviewPixels(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	pixels: Uint8Array
): void {
	if (canvas.width !== width) canvas.width = width;
	if (canvas.height !== height) canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) return;
	const image = context.createImageData(width, height);
	image.data.set(pixels);
	context.putImageData(image, 0, 0);
}
