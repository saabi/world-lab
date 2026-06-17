/// <reference types="@webgpu/types" />

import patchCullShader from '../../gpu/wgsl/terrain/patchCullCompute.wgsl';
import {
	buildCullParams,
	extractFrustumPlanes,
	type FrustumPlanes
} from '../../patches/culling.js';
import type { CubeSpherePatch } from '../../patches/types.js';
import type { Vec3 } from '../../math/vec.js';
import {
	MAX_CUBE_PATCHES,
	uploadCubeSpherePatches
} from '../../params/gpuBuffers.js';
import { CUBE_SPHERE_PATCH_BYTE_SIZE } from '../../params/planetParams.js';

const CULL_UNIFORM_SIZE = 256;
const INDIRECT_STRIDE = 16;

interface BucketBuffers {
	candidateBuffer: GPUBuffer;
	visibleBuffer: GPUBuffer;
	countBuffer: GPUBuffer;
	indirectBuffer: GPUBuffer;
}

export class PatchCullPass {
	private readonly pipeline: GPUComputePipeline;
	private readonly bindGroupLayout: GPUBindGroupLayout;
	private readonly cullUniformBuffer: GPUBuffer;
	private readonly buckets = new Map<number, BucketBuffers>();

	constructor(private readonly device: GPUDevice) {
		this.cullUniformBuffer = device.createBuffer({
			size: CULL_UNIFORM_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});

		const module = device.createShaderModule({ code: patchCullShader });
		this.bindGroupLayout = device.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
				{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
				{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
				{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
			]
		});
		this.pipeline = device.createComputePipeline({
			layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
			compute: { module, entryPoint: 'cs_main' }
		});
	}

	destroy(): void {
		this.cullUniformBuffer.destroy();
		for (const bucket of this.buckets.values()) {
			bucket.candidateBuffer.destroy();
			bucket.visibleBuffer.destroy();
			bucket.countBuffer.destroy();
			bucket.indirectBuffer.destroy();
		}
		this.buckets.clear();
	}

	private ensureBucket(resolution: number): BucketBuffers {
		let bucket = this.buckets.get(resolution);
		if (bucket) return bucket;

		const patchBytes = MAX_CUBE_PATCHES * CUBE_SPHERE_PATCH_BYTE_SIZE;
		bucket = {
			candidateBuffer: this.device.createBuffer({
				size: patchBytes,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
			}),
			visibleBuffer: this.device.createBuffer({
				size: patchBytes,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
			}),
			countBuffer: this.device.createBuffer({
				size: 4,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
			}),
			indirectBuffer: this.device.createBuffer({
				size: INDIRECT_STRIDE,
				usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
			})
		};
		this.buckets.set(resolution, bucket);
		return bucket;
	}

	getBucketBuffers(resolution: number): BucketBuffers {
		return this.ensureBucket(resolution);
	}

	encodeCullBucket(
		encoder: GPUCommandEncoder,
		patches: CubeSpherePatch[],
		resolution: number,
		cameraPos: Vec3,
		planetRadius: number,
		viewProj: Float32Array
	): void {
		if (patches.length === 0) return;

		const bucket = this.ensureBucket(resolution);
		const capped =
			patches.length > MAX_CUBE_PATCHES ? patches.slice(0, MAX_CUBE_PATCHES) : patches;
		const uploadBytes = capped.length * CUBE_SPHERE_PATCH_BYTE_SIZE;
		uploadCubeSpherePatches(this.device, bucket.candidateBuffer, capped);
		this.writeCullUniforms(capped.length, cameraPos, planetRadius, viewProj);
		this.device.queue.writeBuffer(bucket.countBuffer, 0, new Uint32Array([0]));

		const bindGroup = this.device.createBindGroup({
			layout: this.bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: this.cullUniformBuffer } },
				{ binding: 1, resource: { buffer: bucket.candidateBuffer } },
				{ binding: 2, resource: { buffer: bucket.visibleBuffer } },
				{ binding: 3, resource: { buffer: bucket.countBuffer } }
			]
		});

		const pass = encoder.beginComputePass();
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.dispatchWorkgroups(Math.ceil(capped.length / 64));
		pass.end();

		const vertexCount = resolution * resolution * 6;
		this.device.queue.writeBuffer(
			bucket.indirectBuffer,
			0,
			new Uint32Array([vertexCount, 0, 0, 0])
		);
		encoder.copyBufferToBuffer(bucket.countBuffer, 0, bucket.indirectBuffer, 4, 4);
	}

	private writeCullUniforms(
		patchCount: number,
		cameraPos: Vec3,
		planetRadius: number,
		viewProj: Float32Array
	): void {
		const frustum = extractFrustumPlanes(viewProj);
		const params = buildCullParams(cameraPos, planetRadius);
		const buf = new ArrayBuffer(CULL_UNIFORM_SIZE);
		const view = new DataView(buf);
		writeFrustum(view, 0, frustum);
		view.setFloat32(96, cameraPos[0], true);
		view.setFloat32(100, cameraPos[1], true);
		view.setFloat32(104, cameraPos[2], true);
		view.setFloat32(108, 1, true);
		view.setFloat32(112, planetRadius, true);
		view.setFloat32(116, params.backfaceDot, true);
		view.setFloat32(120, params.horizonDot, true);
		view.setUint32(124, params.useHorizonCull ? 1 : 0, true);
		view.setUint32(128, patchCount, true);
		this.device.queue.writeBuffer(this.cullUniformBuffer, 0, buf);
	}
}

function writeFrustum(view: DataView, offset: number, frustum: FrustumPlanes): void {
	for (let i = 0; i < 6; i++) {
		const base = offset + i * 16;
		view.setFloat32(base, frustum.planes[i][0], true);
		view.setFloat32(base + 4, frustum.planes[i][1], true);
		view.setFloat32(base + 8, frustum.planes[i][2], true);
		view.setFloat32(base + 12, frustum.dists[i], true);
	}
}
