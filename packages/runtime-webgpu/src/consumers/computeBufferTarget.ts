import type { ComputeBufferTargetDescriptor } from '@world-lab/graph';

import { executeComputeKernel } from '../computeKernel.js';
import { ResourceRealizer } from '../frameGraph/realize.js';
import type { PassGraph } from '../frameGraph/types.js';

export const COMPUTE_BUFFER_RESOURCE_ID = 'compute-buffer-values';

const SCALE_BUFFER_WGSL = `
fn scale_values(gid: vec3u) {
	if (gid.x >= arrayLength(&values)) {
		return;
	}
	values[gid.x] = values[gid.x] * 2.0;
}`;

export function buildComputeBufferPassGraph(elementCount: number): PassGraph {
	if (!Number.isInteger(elementCount) || elementCount <= 0) {
		throw new Error('Compute buffer element count must be a positive integer');
	}
	return {
		targets: [
			{
				id: COMPUTE_BUFFER_RESOURCE_ID,
				shape: {
					kind: 'buffer',
					element: { kind: 'scalar', scalar: 'f32' },
					access: 'read-write',
					usages: ['storage', 'copy-src', 'copy-dst']
				},
				lifetime: { kind: 'persistent' },
				size: { kind: 'element-count', count: elementCount }
			}
		],
		passes: [
			{
				consumerId: 'compute-buffer-step',
				writeTarget: COMPUTE_BUFFER_RESOURCE_ID,
				reads: [],
				bindings: [
					{ resourceId: COMPUTE_BUFFER_RESOURCE_ID, access: 'read-write' }
				]
			}
		],
		display: COMPUTE_BUFFER_RESOURCE_ID
	};
}

async function readBuffer(
	device: GPUDevice,
	buffer: GPUBuffer,
	elementCount: number
): Promise<Float32Array> {
	const byteLength = elementCount * Float32Array.BYTES_PER_ELEMENT;
	const readback = device.createBuffer({
		label: 'compute-buffer-readback',
		size: byteLength,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	});
	const encoder = device.createCommandEncoder({ label: 'compute-buffer-readback' });
	encoder.copyBufferToBuffer(buffer, 0, readback, 0, byteLength);
	device.queue.submit([encoder.finish()]);
	await readback.mapAsync(GPUMapMode.READ);
	const mapped = new Float32Array(readback.getMappedRange());
	const values = new Float32Array(mapped);
	readback.unmap();
	readback.destroy();
	return values;
}

export class ComputeBufferExecutor {
	private realizer: ResourceRealizer | undefined;
	private device: GPUDevice | undefined;
	private elementCount: number | undefined;
	private seeded = false;

	private ensureAllocated(device: GPUDevice, elementCount: number): void {
		const unchanged =
			this.device === device && this.elementCount === elementCount && this.realizer;
		if (unchanged) return;

		this.dispose();
		this.realizer = new ResourceRealizer(device);
		this.device = device;
		this.elementCount = elementCount;
		this.seeded = false;
	}

	async execute(
		device: GPUDevice,
		target: ComputeBufferTargetDescriptor
	): Promise<{ values: Float32Array }> {
		if (!Number.isInteger(target.elementCount) || target.elementCount <= 0) {
			throw new Error('Compute buffer element count must be a positive integer');
		}
		this.ensureAllocated(device, target.elementCount);
		const graph = buildComputeBufferPassGraph(target.elementCount);
		const realizer = this.realizer!;
		realizer.realizeAll(graph, { width: 1, height: 1 });
		const realized = realizer.resolve(COMPUTE_BUFFER_RESOURCE_ID);
		const buffer = realized.write as GPUBuffer;

		if (!this.seeded) {
			const seed = new Float32Array(target.elementCount);
			for (let index = 0; index < seed.length; index += 1) {
				seed[index] = index + 1;
			}
			device.queue.writeBuffer(buffer, 0, seed);
			this.seeded = true;
		}

		await executeComputeKernel(device, {
			shader: {
				consumerId: target.nodeId,
				stage: 'compute',
				outputs: ['values'],
				code: SCALE_BUFFER_WGSL,
				moduleIds: []
			},
			bindings: target.bindings,
			wgslTypes: new Map([['values', 'array<f32>']]),
			resourceIds: new Map([['values', COMPUTE_BUFFER_RESOURCE_ID]]),
			resources: new Map([
				[COMPUTE_BUFFER_RESOURCE_ID, { kind: 'buffer', buffer }]
			]),
			outputFns: { values: 'scale_values' },
			callArgs: ['gid'],
			workgroupSize: [8, 1, 1],
			dispatch: { kind: 'buffer', elementCount: target.elementCount }
		});
		realizer.advanceFrame();

		return {
			values: await readBuffer(device, buffer, target.elementCount)
		};
	}

	dispose(): void {
		this.realizer?.dispose();
		this.realizer = undefined;
		this.device = undefined;
		this.elementCount = undefined;
		this.seeded = false;
	}
}
