import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '@virtual-planet/graph';

import { defaultPreviewGraph } from './defaultGraph.js';
import { computeGraphCompileSignature } from './graphCompileSignature.js';

describe('computeGraphCompileSignature', () => {
	it('is stable for the same graph document', () => {
		const graph = defaultPreviewGraph();
		expect(computeGraphCompileSignature(graph)).toBe(computeGraphCompileSignature(graph));
	});

	it('changes when a node param changes', () => {
		const graph = defaultPreviewGraph();
		const before = computeGraphCompileSignature(graph);
		const changed: GraphDocument = {
			...graph,
			nodes: graph.nodes.map((node) =>
				node.id === 'n_remap' ? { ...node, params: { inMin: -2, inMax: 1, outMin: 0, outMax: 1 } } : node
			)
		};
		expect(computeGraphCompileSignature(changed)).not.toBe(before);
	});

	it('changes when an edge is removed', () => {
		const graph = defaultPreviewGraph();
		const before = computeGraphCompileSignature(graph);
		const changed: GraphDocument = {
			...graph,
			edges: graph.edges.slice(0, 1)
		};
		expect(computeGraphCompileSignature(changed)).not.toBe(before);
	});
});
