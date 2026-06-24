import waterWgsl from '../gpu/wgsl/scene3d/water.wgsl';
import { makeUVSphere, type SphereMesh } from './sphereMesh.js';
import type { Quat } from '../scene/types.js';
import type { Vec3 } from '../math/vec.js';
import { invert4 } from '../math/mat4.js';
import {
	DEFAULT_ECLIPSE_UNIFORMS,
	ECLIPSE_UNIFORM_SIZE,
	writeEclipseUniforms,
	type EclipseUniforms
} from '../scene/packEclipse.js';
import type { SceneLighting } from './spherePass.js';
import { uvSphereBands, type WaterLodLevel } from './waterLod.js';

export interface WaterInstance {
	position: Vec3;
	seaLevelRadius: number;
	rotation: Quat;
}

export interface WaterRecordOptions {
	waterGloss?: number;
	exposure?: number;
	waterOpacity?: number;
	time?: number;
	waveStrength?: number;
	glintStrength?: number;
	absorptionStrength?: number;
	scatterStrength?: number;
	refractionStrength?: number;
	skyReflectionStrength?: number;
	skyTint?: [number, number, number];
	foamStrength?: number;
	shoreWidth?: number;
	meshLod?: WaterLodLevel;
	viewportWidth?: number;
	viewportHeight?: number;
	/** 0 = shaded, 1 = flat cyan, 2 = lat/long grid, 3+ = diagnostic views. */
	waterDebug?: number;
}

const INSTANCE_FLOATS = 16;
const INSTANCE_BYTES = INSTANCE_FLOATS * 4;
const UNIFORM_SIZE = 256;

function quatToMat3Cols(q: Quat, s: number): [number, number, number][] {
	const [x, y, z, w] = q;
	const xx = x * x;
	const yy = y * y;
	const zz = z * z;
	const xy = x * y;
	const xz = x * z;
	const yz = y * z;
	const wx = w * x;
	const wy = w * y;
	const wz = w * z;
	return [
		[(1 - 2 * (yy + zz)) * s, (2 * (xy + wz)) * s, (2 * (xz - wy)) * s],
		[(2 * (xy - wz)) * s, (1 - 2 * (xx + zz)) * s, (2 * (yz + wx)) * s],
		[(2 * (xz + wy)) * s, (2 * (yz - wx)) * s, (1 - 2 * (xx + yy)) * s]
	];
}

function writeInstance(data: Float32Array, offset: number, inst: WaterInstance): void {
	const cols = quatToMat3Cols(inst.rotation, inst.seaLevelRadius);
	const p = inst.position;
	data[offset + 0] = cols[0]![0];
	data[offset + 1] = cols[0]![1];
	data[offset + 2] = cols[0]![2];
	data[offset + 3] = 0;
	data[offset + 4] = cols[1]![0];
	data[offset + 5] = cols[1]![1];
	data[offset + 6] = cols[1]![2];
	data[offset + 7] = 0;
	data[offset + 8] = cols[2]![0];
	data[offset + 9] = cols[2]![1];
	data[offset + 10] = cols[2]![2];
	data[offset + 11] = 0;
	data[offset + 12] = p[0];
	data[offset + 13] = p[1];
	data[offset + 14] = p[2];
	data[offset + 15] = 1;
}

export class WaterPass {
	private device: GPUDevice;
	private copyPipeline: GPURenderPipeline;
	private waterPipeline: GPURenderPipeline;
	private depthDebugPipeline: GPURenderPipeline;
	private sceneSampler: GPUSampler;
	private meshes = new Map<string, SphereMesh>();
	private vbufs = new Map<string, GPUBuffer>();
	private ibufs = new Map<string, GPUBuffer>();
	private indexCounts = new Map<string, number>();
	private ubuf: GPUBuffer;
	private eclipseBuf: GPUBuffer;
	private bindGroup: GPUBindGroup;
	private depthDebugBindGroup: GPUBindGroup;
	private instanceBuf: GPUBuffer | null = null;
	private instanceCap = 0;

	constructor(device: GPUDevice, format: GPUTextureFormat) {
		this.device = device;
		const module = device.createShaderModule({ code: waterWgsl });
		const vertex: GPUVertexState = {
			module,
			entryPoint: 'vs',
			buffers: [
				{
					arrayStride: 24,
					attributes: [
						{ shaderLocation: 0, offset: 0, format: 'float32x3' },
						{ shaderLocation: 1, offset: 12, format: 'float32x3' }
					]
				},
				{
					arrayStride: INSTANCE_BYTES,
					stepMode: 'instance',
					attributes: [
						{ shaderLocation: 2, offset: 0, format: 'float32x4' },
						{ shaderLocation: 3, offset: 16, format: 'float32x4' },
						{ shaderLocation: 4, offset: 32, format: 'float32x4' },
						{ shaderLocation: 5, offset: 48, format: 'float32x4' }
					]
				}
			]
		};
		const alphaBlend: GPUBlendState = {
			color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
			alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
		};
		this.copyPipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex: { module, entryPoint: 'vs_fullscreen' },
			fragment: {
				module,
				entryPoint: 'fs_copy_scene',
				targets: [{ format }]
			},
			primitive: { topology: 'triangle-list', cullMode: 'none' }
		});
		this.waterPipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex,
			fragment: {
				module,
				entryPoint: 'fs_water',
				targets: [{ format, blend: alphaBlend }]
			},
			primitive: { topology: 'triangle-list', cullMode: 'none' },
		});
		this.depthDebugPipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex,
			fragment: {
				module,
				entryPoint: 'fs_depth_debug',
				targets: [{ format, blend: alphaBlend }]
			},
			primitive: { topology: 'triangle-list', cullMode: 'none' }
		});

		this.ubuf = device.createBuffer({
			size: UNIFORM_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.eclipseBuf = device.createBuffer({
			size: ECLIPSE_UNIFORM_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.sceneSampler = device.createSampler({
			magFilter: 'linear',
			minFilter: 'linear',
			mipmapFilter: 'nearest',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});
		const eclipseInit = new ArrayBuffer(ECLIPSE_UNIFORM_SIZE);
		writeEclipseUniforms(eclipseInit, DEFAULT_ECLIPSE_UNIFORMS);
		device.queue.writeBuffer(this.eclipseBuf, 0, eclipseInit);
		this.bindGroup = device.createBindGroup({
			layout: this.waterPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: this.ubuf } },
				{ binding: 1, resource: { buffer: this.eclipseBuf } }
			]
		});
		this.depthDebugBindGroup = device.createBindGroup({
			layout: this.depthDebugPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: this.ubuf } },
				{ binding: 1, resource: { buffer: this.eclipseBuf } }
			]
		});
	}

	private createWaterSourceBindGroup(
		depthView: GPUTextureView,
		sceneColorView: GPUTextureView
	): GPUBindGroup {
		return this.device.createBindGroup({
			layout: this.waterPipeline.getBindGroupLayout(1),
			entries: [
				{ binding: 0, resource: depthView },
				{ binding: 1, resource: sceneColorView },
				{ binding: 2, resource: this.sceneSampler }
			]
		});
	}

	private createCopySourceBindGroup(sceneColorView: GPUTextureView): GPUBindGroup {
		return this.device.createBindGroup({
			layout: this.copyPipeline.getBindGroupLayout(1),
			entries: [
				{ binding: 1, resource: sceneColorView },
				{ binding: 2, resource: this.sceneSampler }
			]
		});
	}

	private copySceneColor(pass: GPURenderPassEncoder, sceneColorView: GPUTextureView): void {
		pass.setPipeline(this.copyPipeline);
		pass.setBindGroup(1, this.createCopySourceBindGroup(sceneColorView));
		pass.draw(3);
	}

	private ensureMesh(lod: WaterLodLevel): { vbuf: GPUBuffer; ibuf: GPUBuffer; indexCount: number } {
		const bands = uvSphereBands(lod === 'off' ? 'low' : lod);
		const key = `${bands.latBands}x${bands.lonBands}`;
		if (!this.meshes.has(key)) {
			const mesh = makeUVSphere(bands.latBands, bands.lonBands);
			this.meshes.set(key, mesh);
			const vbuf = this.device.createBuffer({
				size: mesh.vertices.byteLength,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
			});
			this.device.queue.writeBuffer(vbuf, 0, mesh.vertices);
			const ibuf = this.device.createBuffer({
				size: (mesh.indices.byteLength + 3) & ~3,
				usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
			});
			this.device.queue.writeBuffer(ibuf, 0, mesh.indices);
			this.vbufs.set(key, vbuf);
			this.ibufs.set(key, ibuf);
			this.indexCounts.set(key, mesh.indexCount);
		}
		return {
			vbuf: this.vbufs.get(key)!,
			ibuf: this.ibufs.get(key)!,
			indexCount: this.indexCounts.get(key)!
		};
	}

	private ensureInstances(count: number) {
		if (count <= this.instanceCap && this.instanceBuf) return;
		this.instanceBuf?.destroy();
		this.instanceCap = Math.max(count, 4);
		this.instanceBuf = this.device.createBuffer({
			size: this.instanceCap * INSTANCE_BYTES,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
		});
	}

	private writeUniforms(
		viewProj: Float32Array,
		light: SceneLighting,
		eclipse: EclipseUniforms,
		options: WaterRecordOptions
	): void {
		const staging = new ArrayBuffer(UNIFORM_SIZE);
		const f32 = new Float32Array(staging);
		const u32 = new Uint32Array(staging);
		f32.set(viewProj, 0);
		f32.set([light.lightPos[0], light.lightPos[1], light.lightPos[2], 0], 16);
		f32.set([light.lightColor[0], light.lightColor[1], light.lightColor[2], light.lightIntensity], 20);
		f32.set([light.ambient[0], light.ambient[1], light.ambient[2], 0], 24);
		f32[28] = options.waterGloss ?? 1.5;
		f32[29] = options.exposure ?? 1;
		f32[30] = options.waterOpacity ?? 0.58;
		u32[31] = options.waterDebug ?? 0;
		f32[32] = options.viewportWidth ?? 1;
		f32[33] = options.viewportHeight ?? 1;
		f32[34] = options.time ?? 0;
		f32[35] = options.waveStrength ?? 0.75;
		f32[36] = options.glintStrength ?? 1.0;
		f32[37] = options.absorptionStrength ?? 1.0;
		f32[38] = options.scatterStrength ?? 0.85;
		f32[39] = options.foamStrength ?? 0.35;
		f32[40] = options.shoreWidth ?? 0.25;
		f32[41] = options.refractionStrength ?? 0.35;
		f32[42] = options.skyReflectionStrength ?? 0.65;
		const skyTint = options.skyTint ?? [0.4, 0.58, 0.85];
		f32[44] = skyTint[0];
		f32[45] = skyTint[1];
		f32[46] = skyTint[2];
		f32.set(invert4(viewProj), 48);
		this.device.queue.writeBuffer(this.ubuf, 0, staging);

		const eclipseStaging = new ArrayBuffer(ECLIPSE_UNIFORM_SIZE);
		writeEclipseUniforms(eclipseStaging, eclipse);
		this.device.queue.writeBuffer(this.eclipseBuf, 0, eclipseStaging);
	}

	private drawInstances(
		pass: GPURenderPassEncoder,
		pipeline: GPURenderPipeline,
		bindGroup0: GPUBindGroup,
		bindGroup1: GPUBindGroup | null,
		instances: WaterInstance[],
		meshLod: WaterLodLevel
	): void {
		const mesh = this.ensureMesh(meshLod);
		this.ensureInstances(instances.length);
		const data = new Float32Array(instances.length * INSTANCE_FLOATS);
		for (let i = 0; i < instances.length; i++) {
			writeInstance(data, i * INSTANCE_FLOATS, instances[i]!);
		}
		this.device.queue.writeBuffer(this.instanceBuf!, 0, data);

		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup0);
		if (bindGroup1) pass.setBindGroup(1, bindGroup1);
		pass.setVertexBuffer(0, mesh.vbuf);
		pass.setVertexBuffer(1, this.instanceBuf!);
		pass.setIndexBuffer(mesh.ibuf, 'uint16');
		pass.drawIndexed(mesh.indexCount, instances.length);
	}

	record(
		pass: GPURenderPassEncoder,
		depthView: GPUTextureView,
		sceneColorView: GPUTextureView,
		instances: WaterInstance[],
		viewProj: Float32Array,
		light: SceneLighting,
		eclipse: EclipseUniforms = DEFAULT_ECLIPSE_UNIFORMS,
		options: WaterRecordOptions = {}
	): void {
		if (instances.length === 0) return;
		this.writeUniforms(viewProj, light, eclipse, options);
		this.copySceneColor(pass, sceneColorView);
		const sourceBindGroup = this.createWaterSourceBindGroup(depthView, sceneColorView);
		this.drawInstances(
			pass,
			this.waterPipeline,
			this.bindGroup,
			sourceBindGroup,
			instances,
			options.meshLod ?? 'high'
		);
	}

	recordDepthDebug(
		pass: GPURenderPassEncoder,
		depthView: GPUTextureView,
		instances: WaterInstance[],
		viewProj: Float32Array,
		light: SceneLighting,
		eclipse: EclipseUniforms = DEFAULT_ECLIPSE_UNIFORMS,
		options: WaterRecordOptions = {}
	): void {
		if (instances.length === 0) return;
		this.writeUniforms(viewProj, light, eclipse, options);
		const depthBindGroup = this.device.createBindGroup({
			layout: this.depthDebugPipeline.getBindGroupLayout(1),
			entries: [{ binding: 0, resource: depthView }]
		});
		this.drawInstances(
			pass,
			this.depthDebugPipeline,
			this.depthDebugBindGroup,
			depthBindGroup,
			instances,
			options.meshLod ?? 'high'
		);
	}

	destroy(): void {
		for (const b of this.vbufs.values()) b.destroy();
		for (const b of this.ibufs.values()) b.destroy();
		this.ubuf.destroy();
		this.eclipseBuf.destroy();
		this.instanceBuf?.destroy();
	}
}
