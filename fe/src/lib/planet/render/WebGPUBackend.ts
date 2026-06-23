import type { PickingResult, RenderBackend, RenderFrame, RenderStats } from './RenderBackend.js';
import { configureWebGPUCanvas, requestWebGPUDevice } from './device.js';
import { AtmospherePass } from './passes/atmospherePass.js';
import { TerrainPass } from './passes/terrainPass.js';

export class WebGPUBackend implements RenderBackend {
	readonly kind = 'webgpu' as const;
	onDeviceLost?: (reason: string) => void;
	/** When true, render() draws into an offscreen target then copies to the swapchain
	 *  (exercises the render-to-target path used for scene compositing). */
	useOffscreen = false;
	private device: GPUDevice | null = null;
	private context: GPUCanvasContext | null = null;
	private format: GPUTextureFormat = 'bgra8unorm';
	private terrain: TerrainPass | null = null;
	private atmosphere: AtmospherePass | null = null;
	private width = 1;
	private height = 1;
	private offscreen: GPUTexture | null = null;
	private offscreenW = 0;
	private offscreenH = 0;
	private destroyed = false;
	/** False when init adopted a shared device — destroy() must not destroy it. */
	private ownsDevice = true;

	async init(canvas: HTMLCanvasElement | null, sharedDevice?: GPUDevice): Promise<void> {
		const device = sharedDevice ?? (await requestWebGPUDevice()).device;
		this.ownsDevice = !sharedDevice;
		this.device = device;
		// device.lost resolves with reason 'destroyed' on our own destroy() (ignore),
		// or 'unknown' on a driver crash / TDR / OOM (report so the host can recover).
		void device.lost.then((info) => {
			if (this.destroyed || info.reason === 'destroyed') return;
			this.device = null;
			this.onDeviceLost?.(info.reason ?? 'unknown');
		});
		this.format = navigator.gpu!.getPreferredCanvasFormat();
		// Offscreen-only (canvas === null): no swapchain; the host composites the result of
		// renderToTexture(). Used by /scene's in-engine procedural layer.
		this.context = canvas ? configureWebGPUCanvas(device, canvas, this.format) : null;
		this.terrain = new TerrainPass(device, this.format);
		this.atmosphere = new AtmospherePass(device, this.format);
	}

	resize(width: number, height: number): void {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
	}

	render(frame: RenderFrame): RenderStats {
		if (!this.device || !this.context || !this.terrain || !this.atmosphere) {
			return { frameMs: 0, patchCount: 0, vertexCount: 0, mode: frame.camera.mode };
		}
		if (this.useOffscreen) {
			const target = this.ensureOffscreen();
			const stats = this.renderInto(target, frame);
			this.present(target);
			return stats;
		}
		return this.renderInto(this.context.getCurrentTexture(), frame);
	}

	/** Render into an external color target (this.format, RENDER_ATTACHMENT) — for
	 *  scene compositing (4b). No swapchain involved. */
	renderToTexture(target: GPUTexture, frame: RenderFrame): RenderStats {
		if (!this.device || !this.terrain || !this.atmosphere) {
			return { frameMs: 0, patchCount: 0, vertexCount: 0, mode: frame.camera.mode };
		}
		return this.renderInto(target, frame);
	}

	/** Record the terrain directly into an external render pass (the scene engine's shared
	 *  color+depth) — single-pass. No atmosphere; the caller owns the pass and depth. Pass a
	 *  floating-origin / focused-body camera in `frame` so the body lands at its world depth. */
	recordTerrainInto(pass: GPURenderPassEncoder, frame: RenderFrame): RenderStats {
		if (!this.device || !this.terrain) {
			return { frameMs: 0, patchCount: 0, vertexCount: 0, mode: frame.camera.mode };
		}
		this.terrain.updateSurfacePatches(frame);
		return this.terrain.renderInto(pass, frame);
	}

	private renderInto(target: GPUTexture, frame: RenderFrame): RenderStats {
		this.terrain!.updateSurfacePatches(frame);
		const encoder = this.device!.createCommandEncoder();
		const stats = this.terrain!.render(encoder, frame, this.width, this.height);
		this.atmosphere!.render(encoder, target, this.terrain!, frame, this.width, this.height);
		this.device!.queue.submit([encoder.finish()]);
		return stats;
	}

	private ensureOffscreen(): GPUTexture {
		if (this.offscreen && this.offscreenW === this.width && this.offscreenH === this.height) {
			return this.offscreen;
		}
		this.offscreen?.destroy();
		this.offscreen = this.device!.createTexture({
			size: { width: this.width, height: this.height },
			format: this.format,
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
		});
		this.offscreenW = this.width;
		this.offscreenH = this.height;
		return this.offscreen;
	}

	private present(source: GPUTexture): void {
		const encoder = this.device!.createCommandEncoder();
		encoder.copyTextureToTexture(
			{ texture: source },
			{ texture: this.context!.getCurrentTexture() },
			{ width: this.width, height: this.height }
		);
		this.device!.queue.submit([encoder.finish()]);
	}

	renderPickingPass(): PickingResult {
		return { hit: false };
	}

	renderHeightfieldPass(): void {
		// stub
	}

	destroy(): void {
		this.destroyed = true;
		this.offscreen?.destroy();
		this.offscreen = null;
		this.atmosphere?.destroy();
		this.terrain?.destroy();
		if (this.ownsDevice) this.device?.destroy(); // a shared device is the host's to destroy
		this.device = null;
		this.context = null;
		this.terrain = null;
		this.atmosphere = null;
	}
}
