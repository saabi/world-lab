import { describe, expect, it } from 'vitest';
import { defaultPreviewGraph } from '../defaultGraph.js';
import { parseGraphMarkup } from './parseGraphMarkup.js';
import { printGraphMarkup } from './printGraph.js';

function canonicalize<T extends { nodes: { id: string }[]; edges: { id: string }[] }>(
	doc: T
): T {
	return {
		...doc,
		nodes: [...doc.nodes].sort((a, b) => a.id.localeCompare(b.id)),
		edges: [...doc.edges].sort((a, b) => a.id.localeCompare(b.id))
	};
}

describe('@virtual-planet/graph-editor markup round-trip', () => {
	it('parse(print(doc)) matches canonical doc', () => {
		const doc = defaultPreviewGraph();
		const roundTripped = parseGraphMarkup(printGraphMarkup(doc));
		expect(canonicalize(roundTripped)).toEqual(canonicalize(doc));
	});
});
