import { Type } from '@world-lab/schema';
import { describe, expect, it } from 'vitest';

import type {
	ResourceBinding,
	ResourceInstance,
	ResourceLifetime,
	ResourceTemplate
} from './implementation.js';
import { registerPrimitive } from './registry.js';
import {
	collectResourceInstances,
	inferBufferUsage,
	resolveBufferUsage
} from './resources.js';
import type { GraphDocument } from './types.js';

const BUFFER_TEMPLATE: ResourceTemplate = {
	shape: {
		kind: 'buffer',
		element: { kind: 'scalar', scalar: 'f32' },
		access: 'read-write',
		usages: ['storage']
	},
	lifetime: { kind: 'persistent' }
};

registerPrimitive({
	id: 'test.resourceInstance',
	category: 'test',
	inputs: [],
	outputs: [],
	params: Type.Object({}),
	implementation: { kind: 'resource', template: BUFFER_TEMPLATE }
});

describe('resource contracts', () => {
	it('restricts templates to resource-shaped TypeRefs', () => {
		const texture: ResourceTemplate = {
			shape: { kind: 'texture', dimension: '2d', sample: 'float' },
			lifetime: { kind: 'transient' }
		};
		const sampler: ResourceTemplate = {
			shape: { kind: 'sampler', filtering: true, comparison: false },
			lifetime: { kind: 'persistent' }
		};

		// @ts-expect-error Scalar values are not allocatable resource shapes.
		const scalar: ResourceTemplate = { shape: { kind: 'scalar', scalar: 'f32' }, lifetime: { kind: 'transient' } };
		void scalar;
		expect([texture.shape.kind, sampler.shape.kind]).toEqual(['texture', 'sampler']);
	});

	it('keeps identity on instances rather than primitive templates', () => {
		// @ts-expect-error A primitive-level resource template cannot own an instance id.
		const templateWithId: ResourceTemplate = { ...BUFFER_TEMPLATE, id: 'shared' };
		// @ts-expect-error A materialized resource instance requires an id.
		const instanceWithoutId: ResourceInstance = { ...BUFFER_TEMPLATE };
		void templateWithId;
		void instanceWithoutId;

		const firstNode = { id: 'node-a' };
		const secondNode = { id: 'node-b' };
		const first: ResourceInstance = { id: firstNode.id, ...BUFFER_TEMPLATE };
		const second: ResourceInstance = { id: secondNode.id, ...BUFFER_TEMPLATE };
		expect(first.id).not.toBe(second.id);
		expect(first.shape).toEqual(second.shape);
	});

	it('round-trips every lifetime variant without losing history slots', () => {
		const lifetimes: ResourceLifetime[] = [
			{ kind: 'transient' },
			{ kind: 'persistent' },
			{ kind: 'history', slots: 2 }
		];
		expect(JSON.parse(JSON.stringify(lifetimes))).toEqual(lifetimes);
	});

	it('materializes distinct node-owned instances from one primitive template', () => {
		const doc: GraphDocument = {
			version: '2',
			nodes: [
				{ id: 'resource-a', primitive: 'test.resourceInstance', inputs: [], outputs: [] },
				{ id: 'resource-b', primitive: 'test.resourceInstance', inputs: [], outputs: [] }
			],
			edges: [],
			outputs: []
		};
		expect(collectResourceInstances(doc)).toEqual([
			{ id: 'resource-a', ...BUFFER_TEMPLATE },
			{ id: 'resource-b', ...BUFFER_TEMPLATE }
		]);
	});
});

describe('buffer usage resolution', () => {
	const bindings: ResourceBinding[] = [
		{ resourceId: 'state', access: 'write' },
		{ resourceId: 'state', access: 'read' }
	];

	it('aggregates read and write bindings into storage allocation usage', () => {
		expect(inferBufferUsage(bindings)).toEqual(['storage']);
	});

	it('unions declared and inferred usages without duplicates', () => {
		expect(resolveBufferUsage(['uniform'], bindings)).toEqual(['uniform', 'storage']);
		expect(resolveBufferUsage(['storage'], bindings)).toEqual(['storage']);
	});

	it('allows unbound resources without inventing usage flags', () => {
		expect(inferBufferUsage([])).toEqual([]);
		expect(resolveBufferUsage([], [])).toEqual([]);
	});
});
