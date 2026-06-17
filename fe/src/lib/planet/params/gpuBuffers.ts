/// <reference types="@webgpu/types" />

import {
	PLANET_PARAMS_BYTE_SIZE,
	SCALE_CONTEXT_BYTE_SIZE,
	LOCAL_FRAME_BYTE_SIZE,
	writePlanetParamsToBuffer,
	type GpuLocalFrame,
	type GpuPlanetParams,
	type GpuScaleContext
} from '../params/planetParams.js';
import type { CubeSpherePatch, SurfacePatch } from '../patches/types.js';
import { CUBE_SPHERE_PATCH_BYTE_SIZE } from '../params/planetParams.js';

export const MAX_CUBE_PATCHES = 4096;
export const CUBE_PATCH_RING_BYTES = MAX_CUBE_PATCHES * CUBE_SPHERE_PATCH_BYTE_SIZE;

export { writePlanetParamsToBuffer };

export function writeScaleContextToBuffer(
	buffer: ArrayBuffer,
	offset: number,
	ctx: GpuScaleContext
): void {
	const view = new DataView(buffer, offset, SCALE_CONTEXT_BYTE_SIZE);
	view.setFloat32(0, ctx.camera_altitude_meters, true);
	view.setFloat32(4, ctx.distance_to_camera_meters, true);
	view.setFloat32(8, ctx.meters_per_pixel, true);
	view.setFloat32(12, ctx.max_feature_frequency, true);
	view.setUint32(16, ctx.mode, true);
	view.setUint32(20, ctx._pad0, true);
	view.setUint32(24, ctx._pad1, true);
	view.setUint32(28, ctx._pad2, true);
}

export function writeLocalFrameToBuffer(
	buffer: ArrayBuffer,
	offset: number,
	frame: GpuLocalFrame
): void {
	const view = new DataView(buffer, offset, LOCAL_FRAME_BYTE_SIZE);
	const writeVec4 = (base: number, v: [number, number, number, number]) => {
		view.setFloat32(base, v[0], true);
		view.setFloat32(base + 4, v[1], true);
		view.setFloat32(base + 8, v[2], true);
		view.setFloat32(base + 12, v[3], true);
	};
	writeVec4(0, frame.origin_ecef);
	writeVec4(16, frame.east);
	writeVec4(32, frame.north);
	writeVec4(48, frame.up);
	writeVec4(64, frame.planet_center_local);
	writeVec4(80, frame.camera_local);
}

export function encodeCubeSpherePatches(
	patches: CubeSpherePatch[],
	target?: ArrayBuffer
): ArrayBuffer {
	const byteLength = patches.length * CUBE_SPHERE_PATCH_BYTE_SIZE;
	const data =
		target && target.byteLength >= byteLength ? target : new ArrayBuffer(byteLength);
	const view = new DataView(data, 0, byteLength);
	for (let i = 0; i < patches.length; i++) {
		const p = patches[i];
		const o = i * CUBE_SPHERE_PATCH_BYTE_SIZE;
		view.setUint32(o, p.face, true);
		view.setFloat32(o + 4, p.uvMin[0], true);
		view.setFloat32(o + 8, p.uvMin[1], true);
		view.setFloat32(o + 12, p.uvMax[0], true);
		view.setFloat32(o + 16, p.uvMax[1], true);
		view.setUint32(o + 20, p.resolution, true);
		view.setFloat32(o + 24, p.morph, true);
		view.setUint32(o + 28, 0, true);
	}
	return data;
}

let patchUploadStaging: ArrayBuffer | null = null;

export function uploadCubeSpherePatches(
	device: GPUDevice,
	buffer: GPUBuffer,
	patches: CubeSpherePatch[],
	byteOffset = 0
): void {
	if (patches.length === 0) return;
	const byteLength = patches.length * CUBE_SPHERE_PATCH_BYTE_SIZE;
	if (!patchUploadStaging || patchUploadStaging.byteLength < byteLength) {
		patchUploadStaging = new ArrayBuffer(Math.max(byteLength, CUBE_PATCH_RING_BYTES));
	}
	const data = encodeCubeSpherePatches(patches, patchUploadStaging);
	device.queue.writeBuffer(buffer, byteOffset, data, 0, byteLength);
}

export function createCubeSpherePatchRingBuffer(device: GPUDevice): GPUBuffer {
	return device.createBuffer({
		size: Math.max(CUBE_PATCH_RING_BYTES, CUBE_SPHERE_PATCH_BYTE_SIZE),
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
	});
}

/** @deprecated Use uploadCubeSpherePatches with a ring buffer. */
export function writeCubeSpherePatchesToBuffer(
	patches: CubeSpherePatch[],
	device: GPUDevice
): GPUBuffer {
	const buffer = createCubeSpherePatchRingBuffer(device);
	uploadCubeSpherePatches(device, buffer, patches);
	return buffer;
}

export function writeSurfacePatchesToBuffer(
	patches: SurfacePatch[],
	device: GPUDevice
): GPUBuffer {
	const stride = 32;
	const data = new ArrayBuffer(patches.length * stride);
	const view = new DataView(data);
	for (let i = 0; i < patches.length; i++) {
		const p = patches[i];
		const o = i * stride;
		view.setFloat32(o, p.originLocalMeters[0], true);
		view.setFloat32(o + 4, p.originLocalMeters[1], true);
		view.setFloat32(o + 8, p.sizeMeters, true);
		view.setUint32(o + 12, p.resolution, true);
		view.setUint32(o + 16, p.ring, true);
		view.setFloat32(o + 20, p.maxFeatureMeters, true);
		view.setFloat32(o + 24, p.morph, true);
	}
	const buffer = device.createBuffer({
		size: Math.max(data.byteLength, stride),
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(buffer, 0, data);
	return buffer;
}

export function createPlanetParamsBuffer(device: GPUDevice): GPUBuffer {
	return device.createBuffer({
		size: PLANET_PARAMS_BYTE_SIZE,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
}

export function createScaleContextBuffer(device: GPUDevice): GPUBuffer {
	return device.createBuffer({
		size: SCALE_CONTEXT_BYTE_SIZE,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
}

export function createLocalFrameBuffer(device: GPUDevice): GPUBuffer {
	return device.createBuffer({
		size: LOCAL_FRAME_BYTE_SIZE,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
}

export function uploadPlanetParams(
	device: GPUDevice,
	buffer: GPUBuffer,
	params: GpuPlanetParams
): void {
	const staging = new ArrayBuffer(PLANET_PARAMS_BYTE_SIZE);
	writePlanetParamsToBuffer(staging, 0, params);
	device.queue.writeBuffer(buffer, 0, staging);
}
