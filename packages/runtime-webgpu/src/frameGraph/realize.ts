import {
	resolveBufferUsage,
	type BufferUsageFlag,
	type ResourceBinding,
	type ResourceShape,
	type ScalarType
} from '@world-lab/graph';

import { alignTo } from '../buffers.js';
import { resolveBufferSizes, resolveTargetSizes } from './order.js';
import type {
	BufferResourceTarget,
	PassGraph,
	ResourceTarget,
	TextureResourceTarget
} from './types.js';

type PhysicalResource = GPUBuffer | GPUTexture;

interface CacheEntry {
	slots: PhysicalResource[];
	fingerprint: string;
}

interface BufferAllocationDescriptor {
	kind: 'buffer';
	slots: number;
	shape: BufferResourceTarget['shape'];
	usage: GPUBufferUsageFlags;
	byteSize: number;
}

interface TextureAllocationDescriptor {
	kind: 'texture';
	slots: number;
	shape: TextureResourceTarget['shape'];
	usage: GPUTextureUsageFlags;
	width: number;
	height: number;
	format: GPUTextureFormat;
}

type AllocationDescriptor = BufferAllocationDescriptor | TextureAllocationDescriptor;

export interface RealizedTarget {
	write: PhysicalResource;
	readPrevious?: PhysicalResource;
}

const SCALAR_BYTE_SIZE: Partial<Record<ScalarType, number>> = {
	f32: 4,
	i32: 4,
	u32: 4,
	f16: 2
};

function bindingsFor(graph: PassGraph, resourceId: string): ResourceBinding[] {
	return graph.passes.flatMap((pass) =>
		(pass.bindings ?? []).filter((binding) => binding.resourceId === resourceId)
	);
}

function bufferUsageBit(flag: BufferUsageFlag): GPUBufferUsageFlags {
	switch (flag) {
		case 'vertex':
			return GPUBufferUsage.VERTEX;
		case 'index':
			return GPUBufferUsage.INDEX;
		case 'uniform':
			return GPUBufferUsage.UNIFORM;
		case 'storage':
			return GPUBufferUsage.STORAGE;
		case 'copy-src':
			return GPUBufferUsage.COPY_SRC;
		case 'copy-dst':
			return GPUBufferUsage.COPY_DST;
		case 'indirect':
			return GPUBufferUsage.INDIRECT;
		case 'query-resolve':
			return GPUBufferUsage.QUERY_RESOLVE;
	}
}

function resolveBufferUsageFlags(
	graph: PassGraph,
	target: BufferResourceTarget
): GPUBufferUsageFlags {
	const usage = resolveBufferUsage(
		target.shape.usages,
		bindingsFor(graph, target.id)
	).reduce((combined, flag) => combined | bufferUsageBit(flag), 0);
	if (usage === 0) {
		throw new Error(
			`Resource "${target.id}" resolves to zero buffer usage flags; declare a usages entry ` +
				'or add a Pass.bindings entry referencing it'
		);
	}
	return usage;
}

export function inferTextureUsage(
	graph: PassGraph,
	targetId: string
): GPUTextureUsageFlags {
	let usage: GPUTextureUsageFlags = 0;
	if (graph.passes.some((pass) => pass.writeTarget === targetId)) {
		usage |= GPUTextureUsage.RENDER_ATTACHMENT;
	}
	if (graph.passes.some((pass) => pass.reads.some((read) => read.target === targetId))) {
		usage |= GPUTextureUsage.TEXTURE_BINDING;
	}
	if (graph.display === targetId) {
		usage |= GPUTextureUsage.COPY_SRC;
	}
	return usage;
}

function resolveTextureUsageFlags(
	graph: PassGraph,
	target: TextureResourceTarget
): GPUTextureUsageFlags {
	if (target.shape.access !== undefined) {
		throw new Error(
			`Resource "${target.id}" declares storage-texture access ("${target.shape.access}"); ` +
				'storage textures are deferred until compute kernel semantics can distinguish ' +
				'textureStore writes from render attachments'
		);
	}
	const usage = inferTextureUsage(graph, target.id);
	if (usage === 0) {
		throw new Error(
			`Resource "${target.id}" resolves to zero texture usage flags; make it a pass target, ` +
				'read it from a pass, or select it for display'
		);
	}
	return usage;
}

export function resolveBufferByteSize(
	shape: Extract<ResourceShape, { kind: 'buffer' }>,
	elementCount: number
): number {
	if (shape.element.kind !== 'scalar') {
		throw new Error(
			`Buffer element kind "${shape.element.kind}" is not yet supported by resource ` +
				'realization (scalar only; aggregate layout is deferred)'
		);
	}
	const scalarSize = SCALAR_BYTE_SIZE[shape.element.scalar];
	if (scalarSize === undefined) {
		throw new Error(
			`Scalar type "${shape.element.scalar}" cannot be stored in a host-shareable buffer`
		);
	}
	return alignTo(scalarSize * elementCount, 4);
}

function requiredSlots(target: ResourceTarget): number {
	return target.lifetime.kind === 'history' ? 2 : 1;
}

function isBufferTarget(target: ResourceTarget): target is BufferResourceTarget {
	return target.shape.kind === 'buffer';
}

function isTextureTarget(target: ResourceTarget): target is TextureResourceTarget {
	return target.shape.kind === 'texture';
}

function allocationDescriptor(
	graph: PassGraph,
	target: ResourceTarget,
	textureSizes: ReturnType<typeof resolveTargetSizes>,
	bufferSizes: ReturnType<typeof resolveBufferSizes>
): AllocationDescriptor {
	if (isBufferTarget(target)) {
		const size = bufferSizes[target.id];
		if (!size) throw new Error(`Buffer resource "${target.id}" has no resolved size`);
		return {
			kind: 'buffer',
			slots: requiredSlots(target),
			shape: target.shape,
			usage: resolveBufferUsageFlags(graph, target),
			byteSize: resolveBufferByteSize(target.shape, size.elementCount)
		};
	}

	if (!isTextureTarget(target)) {
		throw new Error(`Unsupported resource target shape`);
	}
	if (target.shape.dimension !== '2d') {
		throw new Error(
			`Texture dimension "${target.shape.dimension}" is not yet supported by resource ` +
				'realization (2d only)'
		);
	}
	const size = textureSizes[target.id];
	if (!size) throw new Error(`Texture resource "${target.id}" has no resolved size`);
	return {
		kind: 'texture',
		slots: requiredSlots(target),
		shape: target.shape,
		usage: resolveTextureUsageFlags(graph, target),
		width: size.width,
		height: size.height,
		format: (target.shape.format ?? 'rgba8unorm') as GPUTextureFormat
	};
}

function allocateResource(
	device: GPUDevice,
	descriptor: AllocationDescriptor
): PhysicalResource {
	if (descriptor.kind === 'buffer') {
		return device.createBuffer({
			size: descriptor.byteSize,
			usage: descriptor.usage
		});
	}
	return device.createTexture({
		size: [descriptor.width, descriptor.height],
		format: descriptor.format,
		usage: descriptor.usage
	});
}

function allocateSlots(
	device: GPUDevice,
	descriptor: AllocationDescriptor
): PhysicalResource[] {
	const slots: PhysicalResource[] = [];
	try {
		for (let index = 0; index < descriptor.slots; index += 1) {
			slots.push(allocateResource(device, descriptor));
		}
		return slots;
	} catch (error) {
		for (const slot of slots) slot.destroy();
		throw error;
	}
}

function destroyEntry(entry: CacheEntry): void {
	for (const slot of entry.slots) slot.destroy();
}

export class ResourceRealizer {
	readonly #entries = new Map<string, CacheEntry>();
	#frameParity: 0 | 1 = 0;

	constructor(private readonly device: GPUDevice) {}

	realizeAll(
		graph: PassGraph,
		viewport: { width: number; height: number }
	): void {
		const currentIds = new Set(graph.targets.map((target) => target.id));
		for (const [id, entry] of this.#entries) {
			if (currentIds.has(id)) continue;
			destroyEntry(entry);
			this.#entries.delete(id);
		}

		const textureSizes = resolveTargetSizes(graph, viewport);
		const bufferSizes = resolveBufferSizes(graph);
		for (const target of graph.targets) {
			const descriptor = allocationDescriptor(graph, target, textureSizes, bufferSizes);
			const fingerprint = JSON.stringify(descriptor);
			const existing = this.#entries.get(target.id);
			if (existing?.fingerprint === fingerprint) continue;

			const slots = allocateSlots(this.device, descriptor);
			if (existing) destroyEntry(existing);
			this.#entries.set(target.id, { slots, fingerprint });
		}
	}

	resolve(targetId: string): RealizedTarget {
		const entry = this.#entries.get(targetId);
		if (!entry) {
			throw new Error(`Resource "${targetId}" has not been realized`);
		}
		const write = entry.slots[this.#frameParity] ?? entry.slots[0];
		if (!write) throw new Error(`Resource "${targetId}" has no physical allocation`);
		if (entry.slots.length === 1) return { write };
		return {
			write,
			readPrevious: entry.slots[1 - this.#frameParity]
		};
	}

	advanceFrame(): void {
		this.#frameParity = this.#frameParity === 0 ? 1 : 0;
	}

	dispose(): void {
		for (const entry of this.#entries.values()) destroyEntry(entry);
		this.#entries.clear();
		this.#frameParity = 0;
	}
}
