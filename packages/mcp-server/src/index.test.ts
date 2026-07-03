import { describe, expect, it } from 'vitest';

import type { GraphDocument } from '@world-lab/graph';

import {
	describeNode,
	listPrimitives,
	MCP_SERVER_PACKAGE,
	validateGraphDocument
} from './index.js';

function minimalValidGraph(): GraphDocument {
	return {
		version: '1',
		nodes: [
			{
				id: 'n_noise',
				primitive: 'noise.perlin3d',
				inputs: [
					{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f', space: 'body_dir' }
				],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
			},
			{
				id: 'n_remap',
				primitive: 'math.remap',
				inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
				outputs: [{ id: 'out', name: 'out', direction: 'out', dataType: 'f32' }]
			}
		],
		edges: [{ id: 'e1', from: { node: 'n_noise', port: 'value' }, to: { node: 'n_remap', port: 'x' } }],
		outputs: [{ name: 'height', from: { node: 'n_remap', port: 'out' } }],
		consumers: [{ type: 'terrain-mesh', outputs: ['height'] }]
	};
}

describe('@world-lab/mcp-server', () => {
	it('exports its package identity', () => {
		expect(MCP_SERVER_PACKAGE).toBe('@world-lab/mcp-server');
	});

	it('listPrimitives returns at least 15 registered primitives', () => {
		expect(listPrimitives().length).toBeGreaterThanOrEqual(15);
	});

	it('listPrimitives entries have non-empty id and category', () => {
		for (const primitive of listPrimitives()) {
			expect(primitive.id.length).toBeGreaterThan(0);
			expect(primitive.category.length).toBeGreaterThan(0);
		}
	});

	it('describeNode returns procedural.uv with vec2f uv output', () => {
		const description = describeNode('procedural.uv');
		expect(description).not.toBeNull();
		expect(description!.id).toBe('procedural.uv');
		expect(description!.outputs).toContainEqual({
			id: 'uv',
			name: 'uv',
			dataType: 'vec2f'
		});
		expect(description!.implementationKind).toBe('host-input');
		expect(description!.wgslEntry).toBeUndefined();
	});

	it('describeNode returns null for unknown primitives', () => {
		expect(describeNode('nonexistent.thing')).toBeNull();
	});

	it('validateGraphDocument accepts a valid simple graph', () => {
		expect(validateGraphDocument(minimalValidGraph())).toEqual({ valid: true, errors: [] });
	});
});
