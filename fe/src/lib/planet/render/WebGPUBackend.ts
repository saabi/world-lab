import type { PickingResult, RenderBackend, RenderFrame, RenderStats } from './RenderBackend.js';
import { configureWebGPUCanvas, requestWebGPUDevice } from './device.js';
import { AtmospherePass } from './passes/atmospherePass.js';
import { TerrainPass } from './passes/terrainPass.js';
import { seaLevelRadius } from '../camera/seaLevel.js';
import { WaterPass } from '../scene3d/waterPass.js';
import type { SceneLighting } from '../scene3d/spherePass.js';

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
	private water: WaterPass | null = null;
	private waterSource: GPUTexture | null = null;
	private waterSourceW = 0;
	private waterSourceH = 0;
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
			this.water = new WaterPass(device, this.format);
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
	recordTerrainInto(
		pass: GPURenderPassEncoder,
		frame: RenderFrame,
		options?: { surfaceOnly?: boolean }
	): RenderStats {
		if (!this.device || !this.terrain) {
			return { frameMs: 0, patchCount: 0, vertexCount: 0, mode: frame.camera.mode };
		}
		this.terrain.updateSurfacePatches(frame);
		return this.terrain.renderInto(pass, frame, options);
	}

	private renderInto(target: GPUTexture, frame: RenderFrame): RenderStats {
		this.terrain!.updateSurfacePatches(frame);
		const encoder = this.device!.createCommandEncoder();
		const stats = this.terrain!.render(encoder, frame, this.width, this.height);
		this.recordWater(encoder, frame);
		this.atmosphere!.render(encoder, target, this.terrain!, frame, this.width, this.height);
		this.device!.queue.submit([encoder.finish()]);
		return stats;
	}

	private frameWaterLighting(frame: RenderFrame): SceneLighting {
		const light = frame.lighting.lights[0];
		if (!light) {
			return { lightPos: [0, 1e9, 0], lightColor: [1, 1, 1], lightIntensity: 3, ambient: [0.03, 0.035, 0.05] };
		}
		const p = light.positionOrDir;
		const lightPos: [number, number, number] =
			p[3] === 0
				? [p[0] * frame.params.radius * 1000, p[1] * frame.params.radius * 1000, p[2] * frame.params.radius * 1000]
				: [p[0], p[1], p[2]];
		return {
			lightPos,
			lightColor: [light.color[0], light.color[1], light.color[2]],
			lightIntensity: light.color[3],
			ambient: [frame.lighting.ambient[0], frame.lighting.ambient[1], frame.lighting.ambient[2]]
		};
	}

	private recordWater(encoder: GPUCommandEncoder, frame: RenderFrame): void {
		if (!this.water || !this.terrain?.colorView || !this.terrain.depthView) return;
		if (frame.params.render_water <= 0.5) return;
		const colorTexture = this.terrain.getColorTexture();
		if (!colorTexture) return;
		const source = this.ensureWaterSource();
		encoder.copyTextureToTexture(
			{ texture: colorTexture },
			{ texture: source },
			{ width: this.width, height: this.height }
		);
		const pass = encoder.beginRenderPass({
			colorAttachments: [{ view: this.terrain.colorView, loadOp: 'load', storeOp: 'store' }]
		});
		this.water.record(
			pass,
			this.terrain.depthView,
			source.createView(),
			[
				{
					position: [0, 0, 0],
					seaLevelRadius: seaLevelRadius(frame.params),
					rotation: frame.planetRotation
				}
			],
			frame.camera.viewProjectionMatrix,
			this.frameWaterLighting(frame),
			frame.eclipse,
			{
				waterGloss: frame.materialOverrides.waterGloss,
				exposure: frame.materialOverrides.exposure,
				waterOpacity: 0.58,
				meshLod: 'high',
				viewportWidth: this.width,
				viewportHeight: this.height,
				time: frame.time,
				waveStrength: frame.materialOverrides.waterWaveStrength ?? 0.75,
				glintStrength: frame.materialOverrides.waterGlintStrength ?? 1.0,
				absorptionStrength: frame.materialOverrides.waterAbsorptionStrength ?? 1.0,
				scatterStrength: frame.materialOverrides.waterScatterStrength ?? 0.85,
				refractionStrength: frame.materialOverrides.waterRefractionStrength ?? 0.35,
				skyReflectionStrength: frame.materialOverrides.waterSkyReflectionStrength ?? 0.65,
				skyTint: [0.4, 0.58, 0.85],
				foamStrength: frame.materialOverrides.waterFoamStrength ?? 0.35,
				shoreWidth: frame.materialOverrides.waterShoreWidth ?? 0.25
			}
		);
		pass.end();
	}

	private ensureWaterSource(): GPUTexture {
		const w = Math.max(1, this.width);
		const h = Math.max(1, this.height);
		if (this.waterSource && this.waterSourceW === w && this.waterSourceH === h) {
			return this.waterSource;
		}
		this.waterSource?.destroy();
		this.waterSource = this.device!.createTexture({
			size: { width: w, height: h },
			format: this.format,
			usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING
		});
		this.waterSourceW = w;
		this.waterSourceH = h;
		return this.waterSource;
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
		this.waterSource?.destroy();
			this.offscreen = null;
			this.atmosphere?.destroy();
			this.water?.destroy();
			this.terrain?.destroy();
		if (this.ownsDevice) this.device?.destroy(); // a shared device is the host's to destroy
		this.device = null;
		this.context = null;
			this.terrain = null;
			this.atmosphere = null;
			this.water = null;
		}
	}
