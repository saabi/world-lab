import cubeSphereShader from '../../gpu/wgsl/terrain/cubeSphereVertex.wgsl';
import surfacePatchShader from '../../gpu/wgsl/terrain/surfacePatchVertex.wgsl';
import {
	createLocalFrameBuffer,
	createPlanetParamsBuffer,
	createScaleContextBuffer,
	createSurfacePatchRingBuffer,
	uploadPlanetParams,
	uploadSurfacePatches,
	writeLocalFrameToBuffer,
	writeScaleContextToBuffer
} from '../../params/gpuBuffers.js';
import {
	renderModeToGpu,
	toGpuPlanetParams,
	type GpuLocalFrame,
	type GpuScaleContext
} from '../../params/planetParams.js';
import { buildScaleContext, gatedParams } from '../../planet/layers.js';
import { localFrameInBodySpace } from '../../math/localFrame.js';
import {
	BIND_GROUP,
	LIGHTING_UNIFORM_SIZE,
	ATMOSPHERE_UNIFORM_SIZE,
	UNIFORM_ALIGN,
	writeLightingUniforms,
	writeViewUniforms,
	type ViewUniforms
} from '../uniformLayouts.js';
import type { RenderFrame, RenderStats } from '../RenderBackend.js';
import {
	MATERIAL_OVERRIDES_UNIFORM_SIZE,
	writeMaterialOverrides
} from '../materialOverrides.js';
import {
	toGpuAtmosphereParams,
	writeAtmosphereParamsToBuffer
} from '../../params/atmosphereParams.js';
import { ECLIPSE_UNIFORM_SIZE, writeEclipseUniforms } from '../../scene/packEclipse.js';
import { invert4 } from '../../math/mat4.js';
import { cubePatchVertexCount } from '../../patches/cubeSphere.js';
import { RESOLUTION_LEVELS } from '../../patches/cubeSphereScheduler.js';
import { uploadPackedBucket } from '../../params/gpuBuffers.js';
import { PatchCullPass } from './patchCullPass.js';

export const VERTS_PER_PATCH = 6;
export const SURFACE_DISTANCE_FORMAT: GPUTextureFormat = 'r32float';

interface CubeBucketDraw {
	resolution: number;
	patchBuffer: GPUBuffer;
	instanceCount: number;
	vertexCount: number;
}

export class TerrainPass {
	readonly cubePipeline: GPURenderPipeline;
	readonly surfacePipeline: GPURenderPipeline;
	readonly cubeSurfaceOnlyPipeline: GPURenderPipeline;
	readonly surfaceSurfaceOnlyPipeline: GPURenderPipeline;
	readonly viewBuffer: GPUBuffer;
	readonly lightingBuffer: GPUBuffer;
	readonly materialOverridesBuffer: GPUBuffer;
	readonly atmosphereBuffer: GPUBuffer;
	readonly eclipseBuffer: GPUBuffer;
	readonly planetBuffer: GPUBuffer;
	readonly scaleBuffer: GPUBuffer;
	readonly localFrameBuffer: GPUBuffer;
	readonly patchCull: PatchCullPass;
	colorTexture: GPUTexture | null = null;
	colorView: GPUTextureView | null = null;
	depthTexture: GPUTexture | null = null;
	depthView: GPUTextureView | null = null;
	surfaceDistanceTexture: GPUTexture | null = null;
	surfaceDistanceView: GPUTextureView | null = null;
	// Persistent ring buffer (uploaded in place each frame) — no per-frame GPU
	// buffer create/destroy.
	readonly surfacePatchBuffer: GPUBuffer;
	surfacePatchCount = 0;
	private cubeBucketDraws: CubeBucketDraw[] = [];
	private readonly cubeViewBg: GPUBindGroup;
	private readonly cubePlanetBg: GPUBindGroup;
	private readonly cubeScaleBg: GPUBindGroup;
	private readonly cubePatchBgs = new Map<number, GPUBindGroup>();
	private readonly surfaceScaleLocalBg: GPUBindGroup;
	private readonly surfacePatchBg: GPUBindGroup;

	constructor(
		private readonly device: GPUDevice,
		readonly format: GPUTextureFormat
	) {
		this.viewBuffer = device.createBuffer({
			size: UNIFORM_ALIGN,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.lightingBuffer = device.createBuffer({
			size: LIGHTING_UNIFORM_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.materialOverridesBuffer = device.createBuffer({
			size: MATERIAL_OVERRIDES_UNIFORM_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.atmosphereBuffer = device.createBuffer({
			size: ATMOSPHERE_UNIFORM_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.eclipseBuffer = device.createBuffer({
			size: ECLIPSE_UNIFORM_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.planetBuffer = createPlanetParamsBuffer(device);
		this.scaleBuffer = createScaleContextBuffer(device);
		this.localFrameBuffer = createLocalFrameBuffer(device);
		this.patchCull = new PatchCullPass(device);

		const cubeLayout = this.createCubeLayout();
		const surfaceLayout = this.createSurfaceLayout();

		const cubeModule = device.createShaderModule({ code: cubeSphereShader });
		const surfaceModule = device.createShaderModule({ code: surfacePatchShader });

		this.cubePipeline = this.createPipeline(cubeLayout, cubeModule);
		this.surfacePipeline = this.createPipeline(surfaceLayout, surfaceModule);
		this.cubeSurfaceOnlyPipeline = this.createPipeline(cubeLayout, cubeModule, true);
		this.surfaceSurfaceOnlyPipeline = this.createPipeline(surfaceLayout, surfaceModule, true);

		this.cubeViewBg = device.createBindGroup({
			layout: this.cubePipeline.getBindGroupLayout(BIND_GROUP.frame),
			entries: [
				{ binding: 0, resource: { buffer: this.viewBuffer } },
				{ binding: 1, resource: { buffer: this.lightingBuffer } },
				{ binding: 2, resource: { buffer: this.materialOverridesBuffer } },
				{ binding: 3, resource: { buffer: this.atmosphereBuffer } },
				{ binding: 4, resource: { buffer: this.eclipseBuffer } }
			]
		});
		this.cubePlanetBg = device.createBindGroup({
			layout: this.cubePipeline.getBindGroupLayout(BIND_GROUP.planet),
			entries: [{ binding: 0, resource: { buffer: this.planetBuffer } }]
		});
		this.cubeScaleBg = device.createBindGroup({
			layout: this.cubePipeline.getBindGroupLayout(BIND_GROUP.scale),
			entries: [{ binding: 0, resource: { buffer: this.scaleBuffer } }]
		});
		this.surfaceScaleLocalBg = device.createBindGroup({
			layout: this.surfacePipeline.getBindGroupLayout(BIND_GROUP.scale),
			entries: [
				{ binding: 0, resource: { buffer: this.scaleBuffer } },
				{ binding: 1, resource: { buffer: this.localFrameBuffer } }
			]
		});
		this.surfacePatchBuffer = createSurfacePatchRingBuffer(device);
		this.surfacePatchBg = device.createBindGroup({
			layout: this.surfacePipeline.getBindGroupLayout(BIND_GROUP.patches),
			entries: [{ binding: 0, resource: { buffer: this.surfacePatchBuffer } }]
		});
		for (const resolution of RESOLUTION_LEVELS) {
			const patchBuffer = this.patchCull.getBucketBuffers(resolution).visibleBuffer;
			this.cubePatchBgs.set(
				resolution,
				device.createBindGroup({
					layout: this.cubePipeline.getBindGroupLayout(BIND_GROUP.patches),
					entries: [{ binding: 0, resource: { buffer: patchBuffer } }]
				})
			);
		}
	}

	private createCubeLayout(): GPUPipelineLayout {
		return this.device.createPipelineLayout({
			bindGroupLayouts: [
				this.frameBgl(),
				this.uniformBgl(),
				this.uniformBgl(),
				this.storageBgl()
			]
		});
	}

	private createSurfaceLayout(): GPUPipelineLayout {
		return this.device.createPipelineLayout({
			bindGroupLayouts: [
				this.frameBgl(),
				this.uniformBgl(),
				this.scaleAndLocalFrameBgl(),
				this.storageBgl()
			]
		});
	}

	private frameBgl(): GPUBindGroupLayout {
		return this.device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' }
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' }
				},
				{
					binding: 2,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' }
				},
				{
					binding: 3,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' }
				},
				{
					binding: 4,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' }
				}
			]
		});
	}

	private scaleAndLocalFrameBgl(): GPUBindGroupLayout {
		return this.device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' }
				},
				{
					binding: 1,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: 'uniform' }
				}
			]
		});
	}

	private uniformBgl(): GPUBindGroupLayout {
		return this.device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' }
				}
			]
		});
	}

	private storageBgl(): GPUBindGroupLayout {
		return this.device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: 'read-only-storage' }
				}
			]
		});
	}

	private createPipeline(
		layout: GPUPipelineLayout,
		module: GPUShaderModule,
		surfaceOnly = false
	): GPURenderPipeline {
		return this.device.createRenderPipeline({
			layout,
			vertex: { module, entryPoint: 'vs_main' },
			fragment: {
				module,
				entryPoint: 'fs_main',
				targets: [
					{
						format: this.format,
						writeMask: surfaceOnly ? 0 : GPUColorWrite.ALL,
						// objectOpacity cross-fade: src-alpha over. At opacity 1 (/planet) this is
						// fully opaque, so /planet is unchanged; /scene fades terrain in over the
						// background. The surface-distance target (1) keeps writing un-blended.
						blend: {
							color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
							alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
						}
					},
					{ format: SURFACE_DISTANCE_FORMAT }
				]
			},
			primitive: { topology: 'triangle-list', cullMode: 'back' },
			depthStencil: {
				format: 'depth24plus',
				depthWriteEnabled: true,
				depthCompare: 'less'
			}
		});
	}

	ensureTargets(width: number, height: number): void {
		const w = Math.max(1, width);
		const h = Math.max(1, height);
		if (
			this.colorTexture?.width === w &&
			this.colorTexture?.height === h &&
			this.depthTexture?.width === w &&
			this.depthTexture?.height === h &&
			this.surfaceDistanceTexture?.width === w &&
			this.surfaceDistanceTexture?.height === h
		) {
			return;
		}
		this.colorTexture?.destroy();
		this.depthTexture?.destroy();
		this.surfaceDistanceTexture?.destroy();
		this.colorTexture = this.device.createTexture({
			size: [w, h],
			format: this.format,
			// COPY_SRC: when the atmosphere pass is disabled it blits this straight to the swapchain.
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_SRC
		});
		this.colorView = this.colorTexture.createView();
		this.depthTexture = this.device.createTexture({
			size: [w, h],
			format: 'depth24plus',
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
		});
		this.depthView = this.depthTexture.createView();
		this.surfaceDistanceTexture = this.device.createTexture({
			size: [w, h],
			format: SURFACE_DISTANCE_FORMAT,
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
		});
		this.surfaceDistanceView = this.surfaceDistanceTexture.createView();
	}

	getColorView(): GPUTextureView | null {
		return this.colorView;
	}

	getColorTexture(): GPUTexture | null {
		return this.colorTexture;
	}

	getDepthView(): GPUTextureView | null {
		return this.depthView;
	}

	updateSurfacePatches(frame: RenderFrame): void {
		this.surfacePatchCount =
			frame.surfacePatches.length > 0
				? uploadSurfacePatches(this.device, this.surfacePatchBuffer, frame.surfacePatches)
				: 0;
	}

	private prepareCubeBuckets(frame: RenderFrame): CubeBucketDraw[] {
		// The schedule emits GPU-layout byte blocks (32-byte records) per resolution,
		// so we upload them straight with no re-encode and no CubeSpherePatch objects.
		const packed = frame.orbitSchedule?.packedBuckets;
		if (!packed || packed.length === 0) return [];

		const draws: CubeBucketDraw[] = [];
		for (const bucket of packed) {
			if (bucket.instanceCount === 0) continue;
			const bucketGpu = this.patchCull.getBucketBuffers(bucket.resolution);
			uploadPackedBucket(this.device, bucketGpu.visibleBuffer, bucket.data);
			const vertsPerPatch = cubePatchVertexCount(bucket.resolution);
			draws.push({
				resolution: bucket.resolution,
				patchBuffer: bucketGpu.visibleBuffer,
				instanceCount: bucket.instanceCount,
				vertexCount: bucket.instanceCount * vertsPerPatch
			});
		}
		return draws;
	}

	uploadUniforms(frame: RenderFrame): void {
		const viewStaging = new ArrayBuffer(UNIFORM_ALIGN);
		const viewUniforms: ViewUniforms = {
			viewProjection: frame.camera.viewProjectionMatrix,
			view: frame.camera.viewMatrix,
			cameraPos: [frame.camera.position[0], frame.camera.position[1], frame.camera.position[2], 1],
			debug: [
				frame.debug.wireframe ? 1 : 0,
				frame.debug.faceColors ? 1 : 0,
				frame.debug.showPatchBorders ? 1 : 0,
				frame.debug.showRingColors ? 1 : 0
			],
			rotation: frame.planetRotation,
			inverseViewProjection: invert4(frame.camera.viewProjectionMatrix),
			viewport: [frame.viewportWidthPx, frame.viewportHeightPx, 0, 0]
		};
		writeViewUniforms(viewStaging, viewUniforms);
		this.device.queue.writeBuffer(this.viewBuffer, 0, viewStaging);

		const lightingStaging = new ArrayBuffer(LIGHTING_UNIFORM_SIZE);
		writeLightingUniforms(lightingStaging, frame.lighting);
		this.device.queue.writeBuffer(this.lightingBuffer, 0, lightingStaging);

		const overridesStaging = new ArrayBuffer(MATERIAL_OVERRIDES_UNIFORM_SIZE);
		writeMaterialOverrides(overridesStaging, frame.materialOverrides);
		this.device.queue.writeBuffer(this.materialOverridesBuffer, 0, overridesStaging);

		const atmoGpu = toGpuAtmosphereParams(frame.atmosphere, frame.params.radius, [0, 0, 0]);
		const atmoStaging = new ArrayBuffer(ATMOSPHERE_UNIFORM_SIZE);
		writeAtmosphereParamsToBuffer(atmoStaging, 0, atmoGpu);
		this.device.queue.writeBuffer(this.atmosphereBuffer, 0, atmoStaging);

		const eclipseStaging = new ArrayBuffer(ECLIPSE_UNIFORM_SIZE);
		writeEclipseUniforms(eclipseStaging, frame.eclipse);
		this.device.queue.writeBuffer(this.eclipseBuffer, 0, eclipseStaging);

		const dist = Math.hypot(...frame.camera.position);
		const scaleCtx = buildScaleContext(
			frame.camera.mode,
			frame.camera.altitudeMeters,
			dist,
			frame.camera.focalLengthPx,
			frame.viewportHeightPx
		);
		const gated = gatedParams(frame.params, scaleCtx);
		uploadPlanetParams(this.device, this.planetBuffer, toGpuPlanetParams(gated, frame.time));

		const scale: GpuScaleContext = {
			camera_altitude_meters: scaleCtx.cameraAltitudeMeters,
			distance_to_camera_meters: scaleCtx.distanceToCameraMeters,
			meters_per_pixel: scaleCtx.metersPerPixel,
			max_feature_frequency: scaleCtx.maxFeatureFrequency,
			mode: renderModeToGpu(scaleCtx.mode),
			_pad0: 0,
			_pad1: 0,
			_pad2: 0
		};
		const scaleStaging = new ArrayBuffer(32);
		writeScaleContextToBuffer(scaleStaging, 0, scale);
		this.device.queue.writeBuffer(this.scaleBuffer, 0, scaleStaging);

		const bodyLocalFrame = localFrameInBodySpace(frame.localFrame, frame.planetRotation);
		const lf: GpuLocalFrame = {
			origin_ecef: [...bodyLocalFrame.originEcef, 0],
			east: [...bodyLocalFrame.east, 0],
			north: [...bodyLocalFrame.north, 0],
			up: [...bodyLocalFrame.up, 0],
			planet_center_local: [...bodyLocalFrame.planetCenterLocal, 0],
			camera_local: [...bodyLocalFrame.cameraLocal, 0]
		};
		const lfStaging = new ArrayBuffer(96);
		writeLocalFrameToBuffer(lfStaging, 0, lf);
		this.device.queue.writeBuffer(this.localFrameBuffer, 0, lfStaging);
	}

	render(
		encoder: GPUCommandEncoder,
		frame: RenderFrame,
		width: number,
		height: number
	): RenderStats {
		const t0 = performance.now();
		this.ensureTargets(width, height);
		this.uploadUniforms(frame);
		this.cubeBucketDraws = this.prepareCubeBuckets(frame);

		const passEncoder = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.colorView!,
					// Alpha 0 on clear marks "no terrain"; drawn terrain writes alpha 1.
					// The atmosphere pass uses this (not depth, which loses precision and
					// drops distant terrain) to decide terrain vs. sky per pixel.
					clearValue: { r: 0.02, g: 0.03, b: 0.08, a: 0 },
					loadOp: 'clear',
					storeOp: 'store'
				},
				{
					view: this.surfaceDistanceView!,
					clearValue: { r: -1, g: 0, b: 0, a: 0 },
					loadOp: 'clear',
					storeOp: 'store'
				}
			],
			depthStencilAttachment: {
				view: this.depthView!,
				depthClearValue: 1,
				depthLoadOp: 'clear',
				depthStoreOp: 'store'
			}
		});
		const { patchCount, vertexCount } = this.recordDraws(passEncoder);
		passEncoder.end();
		return this.buildStats(frame, t0, patchCount, vertexCount);
	}

	/** Record the terrain draws directly into an external render pass (the scene engine's
	 *  shared color+depth) — the single-pass path. Uniforms use frame.camera, so pass a
	 *  floating-origin / focused-body camera so the body lands at its world depth. No own
	 *  targets; the atmosphere is not drawn here (it returns as a depth-aware pass). */
	renderInto(
		passEncoder: GPURenderPassEncoder,
		frame: RenderFrame,
		options: { surfaceOnly?: boolean } = {}
	): RenderStats {
		const t0 = performance.now();
		this.uploadUniforms(frame);
		this.cubeBucketDraws = this.prepareCubeBuckets(frame);
		const { patchCount, vertexCount } = this.recordDraws(passEncoder, options);
		return this.buildStats(frame, t0, patchCount, vertexCount);
	}

	private recordDraws(
		passEncoder: GPURenderPassEncoder,
		options: { surfaceOnly?: boolean } = {}
	): { patchCount: number; vertexCount: number } {
		const viewBg = this.cubeViewBg;
		const planetBg = this.cubePlanetBg;
		const scaleBg = this.cubeScaleBg;

		let patchCount = 0;
		let vertexCount = 0;

		for (const bucket of this.cubeBucketDraws) {
			if (bucket.instanceCount === 0) continue;
			const patchBg = this.cubePatchBgs.get(bucket.resolution);
			if (!patchBg) continue;
			passEncoder.setPipeline(options.surfaceOnly ? this.cubeSurfaceOnlyPipeline : this.cubePipeline);
			passEncoder.setBindGroup(0, viewBg);
			passEncoder.setBindGroup(1, planetBg);
			passEncoder.setBindGroup(2, scaleBg);
			passEncoder.setBindGroup(3, patchBg);
			const vertsPerPatch = cubePatchVertexCount(bucket.resolution);
			passEncoder.draw(vertsPerPatch, bucket.instanceCount);
			patchCount += bucket.instanceCount;
			vertexCount += bucket.vertexCount;
		}

		if (this.surfacePatchCount > 0) {
			passEncoder.setPipeline(options.surfaceOnly ? this.surfaceSurfaceOnlyPipeline : this.surfacePipeline);
			passEncoder.setBindGroup(0, viewBg);
			passEncoder.setBindGroup(1, planetBg);
			passEncoder.setBindGroup(2, this.surfaceScaleLocalBg);
			passEncoder.setBindGroup(3, this.surfacePatchBg);
			passEncoder.draw(VERTS_PER_PATCH, this.surfacePatchCount);
			patchCount += this.surfacePatchCount;
			vertexCount += this.surfacePatchCount * VERTS_PER_PATCH;
		}
		return { patchCount, vertexCount };
	}

	private buildStats(frame: RenderFrame, t0: number, patchCount: number, vertexCount: number): RenderStats {
		const schedule = frame.orbitSchedule;
		return {
			frameMs: performance.now() - t0,
			patchCount,
			vertexCount,
			mode: frame.camera.mode,
			candidatePatches: schedule?.candidatePatches,
			visiblePatches: patchCount,
			budgetDropped: schedule?.budgetDropped,
			vertexBudget: schedule?.vertexBudget
		};
	}

	destroy(): void {
		this.viewBuffer.destroy();
		this.lightingBuffer.destroy();
		this.materialOverridesBuffer.destroy();
		this.atmosphereBuffer.destroy();
		this.eclipseBuffer.destroy();
		this.planetBuffer.destroy();
		this.scaleBuffer.destroy();
		this.localFrameBuffer.destroy();
		this.patchCull.destroy();
		this.surfacePatchBuffer.destroy();
		this.colorTexture?.destroy();
		this.depthTexture?.destroy();
		this.surfaceDistanceTexture?.destroy();
	}
}
