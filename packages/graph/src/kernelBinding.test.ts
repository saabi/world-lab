import { describe, expect, it } from 'vitest';

import type { KernelBindingTemplate } from './implementation.js';
import {
	isBindingVisibleInStage,
	resolveKernelBindings,
	validateKernelBindingTemplates
} from './kernelBinding.js';

function binding(overrides: Partial<KernelBindingTemplate> = {}): KernelBindingTemplate {
	return {
		name: 'state',
		binding: 0,
		resourceKind: 'buffer',
		access: 'read-write',
		stages: ['compute'],
		...overrides
	};
}

describe('kernel binding contracts', () => {
	it('restricts kernel resource kinds to resource-shaped TypeRefs', () => {
		const buffer: KernelBindingTemplate = binding({ resourceKind: 'buffer' });
		const texture: KernelBindingTemplate = binding({
			name: 'color',
			resourceKind: 'texture',
			access: 'read'
		});
		const sampler: KernelBindingTemplate = binding({
			name: 'linearSampler',
			resourceKind: 'sampler',
			access: 'read'
		});

		// @ts-expect-error Kernel binding resources must be buffers, textures, or samplers.
		const scalar: KernelBindingTemplate = binding({ resourceKind: 'scalar' });
		void scalar;
		expect([buffer.resourceKind, texture.resourceKind, sampler.resourceKind]).toEqual([
			'buffer',
			'texture',
			'sampler'
		]);
	});

	it('rejects duplicate names and binding indices', () => {
		expect(() =>
			validateKernelBindingTemplates(
				[binding(), binding({ name: 'state', binding: 1 })],
				'compute'
			)
		).toThrow('Duplicate kernel binding name: "state"');
		expect(() =>
			validateKernelBindingTemplates(
				[binding(), binding({ name: 'next', binding: 0 })],
				'compute'
			)
		).toThrow('Duplicate kernel binding index 0 ("next")');
	});

	it('rejects invalid binding indices', () => {
		expect(() =>
			validateKernelBindingTemplates([binding({ binding: -1 })], 'compute')
		).toThrow('invalid binding index: -1');
		expect(() =>
			validateKernelBindingTemplates([binding({ binding: 0.5 })], 'compute')
		).toThrow('invalid binding index: 0.5');
	});

	it('rejects empty and owner-invisible stage lists', () => {
		expect(() =>
			validateKernelBindingTemplates([binding({ stages: [] })], 'compute')
		).toThrow('declares no visible stages');
		expect(() =>
			validateKernelBindingTemplates([binding({ stages: ['fragment'] })], 'compute')
		).toThrow('is not visible in its owning kernel');
		expect(() =>
			validateKernelBindingTemplates([binding({ stages: ['vertex', 'fragment'] })], 'fragment')
		).not.toThrow();
	});

	it('rejects sampler and texture write access', () => {
		expect(() =>
			validateKernelBindingTemplates(
				[binding({ resourceKind: 'sampler', access: 'write' })],
				'compute'
			)
		).toThrow("sampler and must declare access:'read'");
		expect(() =>
			validateKernelBindingTemplates(
				[binding({ resourceKind: 'texture', access: 'read-write' })],
				'compute'
			)
		).toThrow("texture binding and must declare access:'read'");
	});

	it('rejects malformed shader names and reserved WGSL keywords', () => {
		for (const name of ['', '1state', 'bad name', 'bad-name']) {
			expect(() =>
				validateKernelBindingTemplates([binding({ name })], 'compute')
			).toThrow('invalid shader name');
		}
		expect(() =>
			validateKernelBindingTemplates([binding({ name: 'fn' })], 'compute')
		).toThrow('reserved WGSL keyword');
	});

	it('resolves binding templates to resource ids without discarding identity', () => {
		const templates = [
			binding({ name: 'previous', binding: 0, access: 'read' }),
			binding({ name: 'next', binding: 1, access: 'write' })
		];

		expect(
			resolveKernelBindings(
				templates,
				'compute',
				new Map([
					['previous', 'node-previous'],
					['next', 'node-next']
				])
			)
		).toEqual([
			{
				resourceId: 'node-previous',
				access: 'read',
				name: 'previous',
				binding: 0,
				resourceKind: 'buffer',
				stages: ['compute']
			},
			{
				resourceId: 'node-next',
				access: 'write',
				name: 'next',
				binding: 1,
				resourceKind: 'buffer',
				stages: ['compute']
			}
		]);
	});

	it('throws on unresolved resource ids after template validation', () => {
		expect(() => resolveKernelBindings([binding()], 'compute', new Map())).toThrow(
			'Kernel binding "state" has no resolved resource id'
		);
		expect(() =>
			resolveKernelBindings([binding({ binding: -1 })], 'compute', new Map())
		).toThrow('invalid binding index');
		expect(() =>
			resolveKernelBindings(
				[binding({ stages: ['fragment'] })],
				'compute',
				new Map([['state', 'node-state']])
			)
		).toThrow('is not visible in its owning kernel');
	});

	it('checks binding stage visibility', () => {
		expect(isBindingVisibleInStage(binding({ stages: ['fragment'] }), 'fragment')).toBe(true);
		expect(isBindingVisibleInStage(binding({ stages: ['fragment'] }), 'compute')).toBe(false);
		expect(isBindingVisibleInStage(binding({ stages: ['vertex', 'fragment'] }), 'vertex')).toBe(true);
	});
});
