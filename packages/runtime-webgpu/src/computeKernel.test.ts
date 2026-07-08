import type { ConsumerShader } from '@world-lab/compiler';
import type { KernelBindingTemplate, ResolvedKernelBinding } from '@world-lab/graph';
import { describe, expect, it, vi } from 'vitest';

import {
	buildComputeBindGroupEntries,
	buildKernelBindingDecls,
	executeComputeKernel,
	resolveDispatchDomain,
	type ComputeKernelResource
} from './computeKernel.js';

function template(overrides: Partial<KernelBindingTemplate> = {}): KernelBindingTemplate {
	return {
		name: 'values',
		binding: 0,
		resourceKind: 'buffer',
		access: 'read-write',
		stages: ['compute'],
		...overrides
	};
}

function resolved(overrides: Partial<ResolvedKernelBinding> = {}): ResolvedKernelBinding {
	return {
		resourceId: 'values-resource',
		access: 'read-write',
		name: 'values',
		binding: 0,
		resourceKind: 'buffer',
		stages: ['compute'],
		...overrides
	};
}

function computeShader(stage = 'compute'): ConsumerShader {
	return {
		consumerId: 'test-compute',
		stage,
		outputs: ['state'],
		code: 'fn step() {}',
		moduleIds: []
	};
}

describe('compute kernel binding helpers', () => {
	it('builds compiler binding declarations from kernel templates and WGSL types', () => {
		const templates = [
			template({ name: 'values', binding: 0, resourceKind: 'buffer', access: 'read-write' }),
			template({ name: 'sourceTex', binding: 1, resourceKind: 'texture', access: 'read' }),
			template({ name: 'linearSampler', binding: 2, resourceKind: 'sampler', access: 'read' })
		];

		expect(
			buildKernelBindingDecls(
				templates,
				new Map([
					['values', 'array<f32>'],
					['sourceTex', 'texture_2d<f32>'],
					['linearSampler', 'sampler']
				])
			)
		).toEqual([
			{
				group: 0,
				binding: 0,
				name: 'values',
				kind: 'storage-read-write',
				wgslType: 'array<f32>'
			},
			{
				group: 0,
				binding: 1,
				name: 'sourceTex',
				kind: 'texture',
				wgslType: 'texture_2d<f32>'
			},
			{
				group: 0,
				binding: 2,
				name: 'linearSampler',
				kind: 'sampler',
				wgslType: 'sampler'
			}
		]);
	});

	it('throws when a kernel binding has no declared WGSL type', () => {
		expect(() => buildKernelBindingDecls([template()], new Map())).toThrow(
			'Kernel binding "values" has no declared WGSL type'
		);
	});

	it('builds bind group entries for buffers, textures, and samplers', () => {
		const buffer = {} as GPUBuffer;
		const view = {} as GPUTextureView;
		const texture = { createView: vi.fn(() => view) } as unknown as GPUTexture;
		const sampler = {} as GPUSampler;

		const entries = buildComputeBindGroupEntries(
			[
				resolved({ resourceId: 'buffer-id', binding: 0, resourceKind: 'buffer' }),
				resolved({
					resourceId: 'texture-id',
					binding: 1,
					resourceKind: 'texture',
					access: 'read',
					name: 'sourceTex'
				}),
				resolved({
					resourceId: 'sampler-id',
					binding: 2,
					resourceKind: 'sampler',
					access: 'read',
					name: 'linearSampler'
				})
			],
			new Map<string, ComputeKernelResource>([
				['buffer-id', { kind: 'buffer', buffer }],
				['texture-id', { kind: 'texture', texture }],
				['sampler-id', { kind: 'sampler', sampler }]
			])
		);

		expect(entries).toEqual([
			{ binding: 0, resource: { buffer } },
			{ binding: 1, resource: view },
			{ binding: 2, resource: sampler }
		]);
		expect(texture.createView).toHaveBeenCalledOnce();
	});

	it('throws when a resolved resource is missing or has the wrong kind', () => {
		expect(() => buildComputeBindGroupEntries([resolved()], new Map())).toThrow(
			'which has no entry in the resources map'
		);
		expect(() =>
			buildComputeBindGroupEntries(
				[resolved({ resourceKind: 'buffer' })],
				new Map<string, ComputeKernelResource>([
					['values-resource', { kind: 'texture', texture: {} as GPUTexture }]
				])
			)
		).toThrow("declares resourceKind:'buffer' but its resolved resource is kind:'texture'");
	});
});

describe('compute kernel dispatch domains', () => {
	it('resolves buffer, texture, and explicit dispatch domains', () => {
		expect(resolveDispatchDomain({ kind: 'buffer', elementCount: 20 }, [8, 1, 1])).toEqual([
			3,
			1,
			1
		]);
		expect(resolveDispatchDomain({ kind: 'texture', width: 17, height: 9 }, [8, 4, 1])).toEqual([
			3,
			3,
			1
		]);
		expect(resolveDispatchDomain([4, 5, 6], [8, 4, 1])).toEqual([4, 5, 6]);
	});

	it('rejects invalid workgroup sizes for every domain kind', () => {
		for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() =>
				resolveDispatchDomain({ kind: 'buffer', elementCount: 1 }, [value, 1, 1])
			).toThrow('workgroupSize[0] must be a positive integer');
			expect(() =>
				resolveDispatchDomain({ kind: 'buffer', elementCount: 1 }, [1, value, 1])
			).toThrow('workgroupSize[1] must be a positive integer');
			expect(() =>
				resolveDispatchDomain({ kind: 'buffer', elementCount: 1 }, [1, 1, value])
			).toThrow('workgroupSize[2] must be a positive integer');
		}
	});

	it('rejects invalid explicit dispatch dimensions', () => {
		for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => resolveDispatchDomain([value, 1, 1], [1, 1, 1])).toThrow(
				'dispatch[0] must be a positive integer'
			);
		}
	});

	it('rejects invalid buffer and texture dimensions', () => {
		for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => resolveDispatchDomain({ kind: 'buffer', elementCount: value }, [1, 1, 1])).toThrow(
				'dispatch.elementCount must be a positive integer'
			);
			expect(() =>
				resolveDispatchDomain({ kind: 'texture', width: value, height: 1 }, [1, 1, 1])
			).toThrow('dispatch.width must be a positive integer');
			expect(() =>
				resolveDispatchDomain({ kind: 'texture', width: 1, height: value }, [1, 1, 1])
			).toThrow('dispatch.height must be a positive integer');
		}
	});
});

describe('executeComputeKernel validation', () => {
	it('rejects non-compute shaders before creating GPU objects', async () => {
		const device = {
			createShaderModule: vi.fn(),
			createComputePipelineAsync: vi.fn()
		} as unknown as GPUDevice;

		await expect(
			executeComputeKernel(device, {
				shader: computeShader('fragment'),
				bindings: [],
				wgslTypes: new Map(),
				resourceIds: new Map(),
				resources: new Map(),
				outputFns: { state: 'step' },
				workgroupSize: [1, 1, 1],
				dispatch: [1, 1, 1]
			})
		).rejects.toThrow('executeComputeKernel requires a compute-stage shader');
		expect(device.createShaderModule).not.toHaveBeenCalled();
		expect(device.createComputePipelineAsync).not.toHaveBeenCalled();
	});

	it('passes compute as the kernel binding owner stage', async () => {
		const device = {
			createShaderModule: vi.fn(),
			createComputePipelineAsync: vi.fn()
		} as unknown as GPUDevice;

		await expect(
			executeComputeKernel(device, {
				shader: computeShader(),
				bindings: [template({ stages: ['vertex'] })],
				wgslTypes: new Map([['values', 'array<f32>']]),
				resourceIds: new Map([['values', 'values-resource']]),
				resources: new Map(),
				outputFns: { state: 'step' },
				workgroupSize: [1, 1, 1],
				dispatch: [1, 1, 1]
			})
		).rejects.toThrow('is not visible in its owning kernel');
		expect(device.createShaderModule).not.toHaveBeenCalled();
		expect(device.createComputePipelineAsync).not.toHaveBeenCalled();
	});
});
