import type { PickingResult, RenderBackend, RenderFrame, RenderStats } from './RenderBackend.js';
import { configureWebGPUCanvas, requestWebGPUDevice } from './device.js';
import { TerrainPass } from './passes/terrainPass.js';

export class WebGPUBackend implements RenderBackend {
	readonly kind = 'webgpu' as const;
	private device: GPUDevice | null = null;
	private context: GPUCanvasContext | null = null;
	private format: GPUTextureFormat = 'bgra8unorm';
	private terrain: TerrainPass | null = null;
	private width = 1;
	private height = 1;

	async init(canvas: HTMLCanvasElement): Promise<void> {
		const { device } = await requestWebGPUDevice();
		this.device = device;
		this.format = navigator.gpu!.getPreferredCanvasFormat();
		this.context = configureWebGPUCanvas(device, canvas, this.format);
		this.terrain = new TerrainPass(device, this.format);
	}

	resize(width: number, height: number): void {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
	}

	render(frame: RenderFrame): RenderStats {
		if (!this.device || !this.context || !this.terrain) {
			return { frameMs: 0, patchCount: 0, vertexCount: 0, mode: frame.camera.mode };
		}
		this.terrain.updateSurfacePatches(frame);
		const texture = this.context.getCurrentTexture();
		const encoder = this.device.createCommandEncoder();
		const stats = this.terrain.render(encoder, texture.createView(), frame, this.width, this.height);
		this.device.queue.submit([encoder.finish()]);
		return stats;
	}

	renderPickingPass(): PickingResult {
		return { hit: false };
	}

	renderHeightfieldPass(): void {
		// stub
	}

	destroy(): void {
		this.terrain?.destroy();
		this.device?.destroy();
		this.device = null;
		this.context = null;
		this.terrain = null;
	}
}
