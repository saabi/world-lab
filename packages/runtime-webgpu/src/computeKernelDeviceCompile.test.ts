import type { ConsumerShader } from '@world-lab/compiler';
import type { KernelBindingTemplate } from '@world-lab/graph';
import { describe, expect, it } from 'vitest';

import { executeComputeKernel } from './computeKernel.js';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

describe('generic compute kernel device execution', () => {
	it.skipIf(!hasWebGPU)('dispatches a buffer kernel through generic bindings', async () => {
		const { requestGpuDevice } = await import('./device.js');
		const { device } = await requestGpuDevice();
		const input = Float32Array.from({ length: 20 }, (_, index) => index + 1);
		const byteLength = input.byteLength;

		const valuesBuffer = device.createBuffer({
			label: 'generic-compute-values',
			size: byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
		});
		const readbackBuffer = device.createBuffer({
			label: 'generic-compute-readback',
			size: byteLength,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
		});

		try {
			device.queue.writeBuffer(
				valuesBuffer,
				0,
				input.buffer,
				input.byteOffset,
				input.byteLength
			);

			const shader: ConsumerShader = {
				consumerId: 'generic-compute-doubling',
				stage: 'compute',
				outputs: ['state'],
				code: `fn double_values(gid: vec3u) {
\tif (gid.x >= arrayLength(&values)) {
\t\treturn;
\t}
\tvalues[gid.x] = values[gid.x] * 2.0;
}`,
				moduleIds: []
			};
			const bindings: KernelBindingTemplate[] = [
				{
					name: 'values',
					binding: 0,
					resourceKind: 'buffer',
					access: 'read-write',
					stages: ['compute']
				}
			];

			await executeComputeKernel(device, {
				shader,
				bindings,
				wgslTypes: new Map([['values', 'array<f32>']]),
				resourceIds: new Map([['values', 'values-resource']]),
				resources: new Map([['values-resource', { kind: 'buffer', buffer: valuesBuffer }]]),
				outputFns: { state: 'double_values' },
				callArgs: ['gid'],
				workgroupSize: [8, 1, 1],
				dispatch: { kind: 'buffer', elementCount: input.length }
			});

			const encoder = device.createCommandEncoder({ label: 'generic-compute-readback' });
			encoder.copyBufferToBuffer(valuesBuffer, 0, readbackBuffer, 0, byteLength);
			device.queue.submit([encoder.finish()]);

			await readbackBuffer.mapAsync(GPUMapMode.READ);
			const output = new Float32Array(readbackBuffer.getMappedRange()).slice();
			readbackBuffer.unmap();
			expect([...output]).toEqual([...input].map((value) => value * 2));
		} finally {
			valuesBuffer.destroy();
			readbackBuffer.destroy();
			device.destroy();
		}
	});
});
