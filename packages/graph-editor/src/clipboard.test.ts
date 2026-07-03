import { describe, expect, it, beforeEach } from 'vitest';
import '@world-lab/graph';
import { applyEditIntent, resetIdCounters } from './irAdapter.js';
import { copyNodeToClipboard, pasteOffsetPosition } from './clipboard.js';

describe('@world-lab/graph-editor clipboard', () => {
	beforeEach(() => {
		resetIdCounters();
	});

	it('copyNodeToClipboard captures primitive and params', () => {
		let doc = applyEditIntent(
			{ version: '2', nodes: [], edges: [], outputs: [] },
			{ kind: 'add-node', primitiveId: 'math.remap', position: { x: 0, y: 0 } }
		);
		doc = applyEditIntent(doc, {
			kind: 'set-params',
			nodeId: doc.nodes[0]!.id,
			params: { inMin: -2, inMax: 2, outMin: 0, outMax: 1 }
		});

		expect(copyNodeToClipboard(doc, doc.nodes[0]!.id)).toEqual({
			primitiveId: 'math.remap',
			params: { inMin: -2, inMax: 2, outMin: 0, outMax: 1 }
		});
	});

	it('duplicate-node preserves params with a new id', () => {
		let doc = applyEditIntent(
			{ version: '2', nodes: [], edges: [], outputs: [] },
			{ kind: 'add-node', primitiveId: 'math.remap', position: { x: 10, y: 20 } }
		);
		const sourceId = doc.nodes[0]!.id;
		doc = applyEditIntent(doc, {
			kind: 'set-params',
			nodeId: sourceId,
			params: { inMin: -1, inMax: 1, outMin: 0, outMax: 1 }
		});

		doc = applyEditIntent(doc, {
			kind: 'duplicate-node',
			sourceNodeId: sourceId,
			position: pasteOffsetPosition({ x: 10, y: 20 })
		});

		expect(doc.nodes).toHaveLength(2);
		expect(doc.nodes[1]?.id).not.toBe(sourceId);
		expect(doc.nodes[1]?.params).toEqual(doc.nodes[0]?.params);
		expect(doc.edges).toHaveLength(0);
	});

	it('duplicate-node remaps copied edges to the new node id', () => {
		let doc = applyEditIntent(
			{ version: '2', nodes: [], edges: [], outputs: [] },
			{ kind: 'add-node', primitiveId: 'constant.f32', position: { x: 0, y: 0 } }
		);
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 120, y: 0 }
		});
		const sourceId = doc.nodes[0]!.id;
		const targetId = doc.nodes[1]!.id;
		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: sourceId, port: 'value' },
			to: { node: targetId, port: 'x' }
		});

		doc = applyEditIntent(doc, {
			kind: 'duplicate-node',
			sourceNodeId: sourceId,
			position: pasteOffsetPosition({ x: 0, y: 0 })
		});

		const cloneId = doc.nodes[2]!.id;
		expect(cloneId).not.toBe(sourceId);
		expect(doc.edges).toHaveLength(2);
		const clonedEdge = doc.edges.find((edge) => edge.from.node === cloneId);
		expect(clonedEdge).toBeDefined();
		expect(clonedEdge?.to).toEqual({ node: targetId, port: 'x' });
		expect(clonedEdge?.id).not.toBe(doc.edges[0]?.id);
	});
});
