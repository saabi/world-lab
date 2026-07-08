import { describe, expect, it } from 'vitest';

import {
	computeBufferTargetForNode,
	deriveComputeBufferTarget,
	getPrimitive,
	isComputeBufferTarget,
	type GraphDocument,
	type Node
} from './index.js';

function sink(id: string, params: Record<string, unknown>): Node {
	const primitive = getPrimitive('target.computeBuffer');
	if (!primitive) throw new Error('target.computeBuffer is not registered');
	return {
		id,
		primitive: primitive.id,
		params,
		inputs: [],
		outputs: []
	};
}

function graph(nodes: Node[]): GraphDocument {
	return { version: '2', nodes, edges: [], outputs: [] };
}

describe('target.computeBuffer', () => {
	it('is registered as a compute kernel target', () => {
		const primitive = getPrimitive('target.computeBuffer');
		expect(primitive).toBeDefined();
		expect(primitive?.implementation).toEqual({
			kind: 'kernel',
			stage: 'compute',
			bindings: [
				{
					name: 'values',
					binding: 0,
					resourceKind: 'buffer',
					access: 'read-write',
					stages: ['compute']
				}
			]
		});
		expect(primitive?.metadata?.role).toBe('computeBufferTarget');
	});

	it('detects the role and derives a descriptor', () => {
		const node = sink('compute', { elementCount: 20 });
		expect(isComputeBufferTarget(node)).toBe(true);
		expect(deriveComputeBufferTarget(graph([node]))).toEqual({
			nodeId: 'compute',
			elementCount: 20,
			bindings: [
				{
					name: 'values',
					binding: 0,
					resourceKind: 'buffer',
					access: 'read-write',
					stages: ['compute']
				}
			]
		});
	});

	it('returns null when no compute buffer target is present', () => {
		expect(deriveComputeBufferTarget(graph([]))).toBeNull();
	});

	it('rejects ambiguous targets', () => {
		expect(() =>
			deriveComputeBufferTarget(
				graph([
					sink('a', { elementCount: 8 }),
					sink('b', { elementCount: 8 })
				])
			)
		).toThrow(/at most one/);
	});

	it.each([
		['missing', {}],
		['zero', { elementCount: 0 }],
		['negative', { elementCount: -1 }],
		['fractional', { elementCount: 1.5 }]
	])('rejects %s elementCount', (_name, params) => {
		expect(() => computeBufferTargetForNode(sink('bad', params))).toThrow(
			/positive integer/
		);
	});
});
