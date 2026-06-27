import '@virtual-planet/graph';
import { describe, expect, it, beforeEach } from 'vitest';
import type { GraphDocument } from '@virtual-planet/graph';
import {
	applyEditIntent,
	graphToFlow,
	resetIdCounters,
	validateConnection
} from './irAdapter.js';

function emptyDoc(): GraphDocument {
	return {
		version: '1',
		nodes: [],
		edges: [],
		outputs: [],
		consumers: []
	};
}

describe('@virtual-planet/graph-editor irAdapter', () => {
	beforeEach(() => {
		resetIdCounters();
	});

	it('adds and removes nodes through applyEditIntent', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 10, y: 20 }
		});
		expect(doc.nodes).toHaveLength(1);

		doc = applyEditIntent(doc, { kind: 'remove-node', nodeId: doc.nodes[0]!.id });
		expect(doc.nodes).toHaveLength(0);
	});

	it('round-trips node positions through graphToFlow', () => {
		const doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'procedural.uv',
			position: { x: 42, y: 7 }
		});
		const flow = graphToFlow(doc);
		expect(flow.nodes[0]?.position).toEqual({ x: 42, y: 7 });
	});

	it('rejects type-mismatched connections', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'procedural.uv',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 100, y: 0 }
		});

		const uvNode = doc.nodes.find((node) => node.primitive === 'procedural.uv')!;
		const remapNode = doc.nodes.find((node) => node.primitive === 'math.remap')!;

		const result = validateConnection(
			doc,
			{ node: uvNode.id, port: 'uv' },
			{ node: remapNode.id, port: 'x' }
		);
		expect(result.ok).toBe(false);
		expect(result.issues.some((issue) => issue.kind === 'type-mismatch')).toBe(true);
	});

	it('rejects space-mismatched connections', () => {
		const doc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_a',
					primitive: 'noise.perlin3d',
					inputs: [
						{
							id: 'position',
							name: 'position',
							direction: 'in',
							dataType: 'vec3f',
							space: 'body_dir'
						}
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32', space: 'world_dir' }]
				},
				{
					id: 'n_b',
					primitive: 'math.remap',
					inputs: [
						{ id: 'x', name: 'x', direction: 'in', dataType: 'f32', space: 'body_dir' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [],
			consumers: []
		};

		const result = validateConnection(
			doc,
			{ node: 'n_a', port: 'value' },
			{ node: 'n_b', port: 'x' }
		);
		expect(result.ok).toBe(false);
		expect(result.issues.some((issue) => issue.kind === 'space-mismatch')).toBe(true);
	});

	it('accepts vec2f to vec3f promotion', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'procedural.uv',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'noise.perlin3d',
			position: { x: 100, y: 0 }
		});

		const uvNode = doc.nodes.find((node) => node.primitive === 'procedural.uv')!;
		const perlinNode = doc.nodes.find((node) => node.primitive === 'noise.perlin3d')!;

		const result = validateConnection(
			doc,
			{ node: uvNode.id, port: 'uv' },
			{ node: perlinNode.id, port: 'position' }
		);
		expect(result.ok).toBe(true);
	});

	it('accepts valid f32 connections', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 100, y: 0 }
		});

		const first = doc.nodes[0]!;
		const second = doc.nodes[1]!;

		const result = validateConnection(
			doc,
			{ node: first.id, port: 'value' },
			{ node: second.id, port: 'x' }
		);
		expect(result.ok).toBe(true);

		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: first.id, port: 'value' },
			to: { node: second.id, port: 'x' }
		});
		expect(doc.edges).toHaveLength(1);
	});
});
