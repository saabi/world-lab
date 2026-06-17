import cubeSphereShader from '../../gpu/wgsl/terrain/cubeSphereVertex.wgsl';
import surfacePatchShader from '../../gpu/wgsl/terrain/surfacePatchVertex.wgsl';
import {
	createLocalFrameBuffer,
	createPlanetParamsBuffer,
	createScaleContextBuffer,
	uploadPlanetParams,
	writeLocalFrameToBuffer,
	writeScaleContextToBuffer,
	writeSurfacePatchesToBuffer
} from '../../params/gpuBuffers.js';
import {
	renderModeToGpu,
	toGpuPlanetParams,
	type GpuLocalFrame,
	type GpuScaleContext
} from '../../params/planetParams.js';
import { buildScaleContext, gatedParams } from '../../planet/layers.js';
import {
	BIND_GROUP,
	LIGHTING_UNIFORM_SIZE,
	UNIFORM_ALIGN,
	writeLightingUniforms,
	writeViewUniforms,
	type ViewUniforms
} from '../uniformLayouts.js';
import type { RenderFrame, RenderStats } from '../RenderBackend.js';
import { cubePatchVertexCount } from '../../patches/cubeSphere.js';
import { RESOLUTION_LEVELS } from '../../patches/cubeSphereScheduler.js';
import { uploadCubeSpherePatches } from '../../params/gpuBuffers.js';
import { PatchCullPass } from './patchCullPass.js';

export const VERTS_PER_PATCH = 6;

interface CubeBucketDraw {
	resolution: number;
	patchBuffer: GPUBuffer;
	instanceCount: number;
	vertexCount: number;
}

export class TerrainPass {
	readonly cubePipeline: GPURenderPipeline;
	readonly surfacePipeline: GPURenderPipeline;
	readonly viewBuffer: GPUBuffer;
	readonly lightingBuffer: GPUBuffer;
	readonly planetBuffer: GPUBuffer;
	readonly scaleBuffer: GPUBuffer;
	readonly localFrameBuffer: GPUBuffer;
	readonly patchCull: PatchCullPass;
	depthTexture: GPUTexture | null = null;
	depthView: GPUTextureView | null = null;
	surfacePatchBuffer: GPUBuffer | null = null;
	surfacePatchCount = 0;
	private cubeBucketDraws: CubeBucketDraw[] = [];
	private readonly cubeViewBg: GPUBindGroup;
	private readonly cubePlanetBg: GPUBindGroup;
	private readonly cubeScaleBg: GPUBindGroup;
	private readonly cubePatchBgs = new Map<number, GPUBindGroup>();
	private readonly surfaceScaleLocalBg: GPUBindGroup;

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

		this.cubeViewBg = device.createBindGroup({
			layout: this.cubePipeline.getBindGroupLayout(BIND_GROUP.frame),
			entries: [
				{ binding: 0, resource: { buffer: this.viewBuffer } },
				{ binding: 1, resource: { buffer: this.lightingBuffer } }
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

	private createPipeline(layout: GPUPipelineLayout, module: GPUShaderModule): GPURenderPipeline {
		return this.device.createRenderPipeline({
			layout,
			vertex: { module, entryPoint: 'vs_main' },
			fragment: {
				module,
				entryPoint: 'fs_main',
				targets: [{ format: this.format }]
			},
			primitive: { topology: 'triangle-list', cullMode: 'back' },
			depthStencil: {
				format: 'depth24plus',
				depthWriteEnabled: true,
				depthCompare: 'less'
			}
		});
	}

	ensureDepth(width: number, height: number): void {
		if (this.depthTexture?.width === width && this.depthTexture?.height === height) return;
		this.depthTexture?.destroy();
		this.depthTexture = this.device.createTexture({
			size: [Math.max(1, width), Math.max(1, height)],
			format: 'depth24plus',
			usage: GPUTextureUsage.RENDER_ATTACHMENT
		});
		this.depthView = this.depthTexture.createView();
	}

	updateSurfacePatches(frame: RenderFrame): void {
		this.surfacePatchBuffer?.destroy();
		this.surfacePatchCount = frame.surfacePatches.length;
		if (this.surfacePatchCount > 0) {
			this.surfacePatchBuffer = writeSurfacePatchesToBuffer(frame.surfacePatches, this.device);
		} else {
			this.surfacePatchBuffer = null;
		}
	}

	private prepareCubeBuckets(frame: RenderFrame): CubeBucketDraw[] {
		const buckets = frame.orbitSchedule?.buckets;
		if (!buckets || buckets.size === 0) return [];

		const draws: CubeBucketDraw[] = [];

		for (const resolution of RESOLUTION_LEVELS) {
			const candidates = buckets.get(resolution);
			if (!candidates?.length) continue;

			const visible = candidates;

			const bucketGpu = this.patchCull.getBucketBuffers(resolution);
			uploadCubeSpherePatches(this.device, bucketGpu.visibleBuffer, visible);

			const vertsPerPatch = cubePatchVertexCount(resolution);
			draws.push({
				resolution,
				patchBuffer: bucketGpu.visibleBuffer,
				instanceCount: visible.length,
				vertexCount: visible.length * vertsPerPatch
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
			]
		};
		writeViewUniforms(viewStaging, viewUniforms);
		this.device.queue.writeBuffer(this.viewBuffer, 0, viewStaging);

		const lightingStaging = new ArrayBuffer(LIGHTING_UNIFORM_SIZE);
		writeLightingUniforms(lightingStaging, frame.lighting);
		this.device.queue.writeBuffer(this.lightingBuffer, 0, lightingStaging);

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

		const lf: GpuLocalFrame = {
			origin_ecef: [...frame.localFrame.originEcef, 0],
			east: [...frame.localFrame.east, 0],
			north: [...frame.localFrame.north, 0],
			up: [...frame.localFrame.up, 0],
			planet_center_local: [...frame.localFrame.planetCenterLocal, 0],
			camera_local: [...frame.localFrame.cameraLocal, 0]
		};
		const lfStaging = new ArrayBuffer(96);
		writeLocalFrameToBuffer(lfStaging, 0, lf);
		this.device.queue.writeBuffer(this.localFrameBuffer, 0, lfStaging);
	}

	render(
		encoder: GPUCommandEncoder,
		colorView: GPUTextureView,
		frame: RenderFrame,
		width: number,
		height: number
	): RenderStats {
		const t0 = performance.now();
		this.ensureDepth(width, height);
		this.uploadUniforms(frame);
		this.cubeBucketDraws = this.prepareCubeBuckets(frame);

		const passEncoder = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: colorView,
					clearValue: { r: 0.02, g: 0.03, b: 0.08, a: 1 },
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

		const viewBg = this.cubeViewBg;
		const planetBg = this.cubePlanetBg;
		const scaleBg = this.cubeScaleBg;

		let patchCount = 0;
		let vertexCount = 0;

		for (const bucket of this.cubeBucketDraws) {
			if (bucket.instanceCount === 0) continue;
			const patchBg = this.cubePatchBgs.get(bucket.resolution);
			if (!patchBg) continue;
			passEncoder.setPipeline(this.cubePipeline);
			passEncoder.setBindGroup(0, viewBg);
			passEncoder.setBindGroup(1, planetBg);
			passEncoder.setBindGroup(2, scaleBg);
			passEncoder.setBindGroup(3, patchBg);
			const vertsPerPatch = cubePatchVertexCount(bucket.resolution);
			passEncoder.draw(vertsPerPatch, bucket.instanceCount);
			patchCount += bucket.instanceCount;
			vertexCount += bucket.vertexCount;
		}

		if (this.surfacePatchBuffer && this.surfacePatchCount > 0) {
			const patchBg = this.device.createBindGroup({
				layout: this.surfacePipeline.getBindGroupLayout(BIND_GROUP.patches),
				entries: [{ binding: 0, resource: { buffer: this.surfacePatchBuffer } }]
			});
			const scaleLocalBg = this.surfaceScaleLocalBg;
			passEncoder.setPipeline(this.surfacePipeline);
			passEncoder.setBindGroup(0, viewBg);
			passEncoder.setBindGroup(1, planetBg);
			passEncoder.setBindGroup(2, scaleLocalBg);
			passEncoder.setBindGroup(3, patchBg);
			passEncoder.draw(VERTS_PER_PATCH, this.surfacePatchCount);
			patchCount += this.surfacePatchCount;
			vertexCount += this.surfacePatchCount * VERTS_PER_PATCH;
		}

		passEncoder.end();
		const frameMs = performance.now() - t0;
		const schedule = frame.orbitSchedule;
		return {
			frameMs,
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
		this.planetBuffer.destroy();
		this.scaleBuffer.destroy();
		this.localFrameBuffer.destroy();
		this.patchCull.destroy();
		this.surfacePatchBuffer?.destroy();
		this.depthTexture?.destroy();
	}
}
