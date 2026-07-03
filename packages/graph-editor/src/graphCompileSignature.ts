import type { GraphDocument } from '@world-lab/graph';

import { getPrimitiveSource } from './primitiveSources.js';

/** Stable signature of graph topology + params + primitive WGSL sources (for preview/compile reactivity). */
export function computeGraphCompileSignature(doc: GraphDocument): string {
	const primitiveIds = [...new Set(doc.nodes.map((node) => node.primitive))].sort();
	const sourceDigest = primitiveIds.map((id) => `${id}\x1f${getPrimitiveSource(id)}`).join('\x1e');

	const graphDigest = JSON.stringify({
		version: doc.version,
		nodes: [...doc.nodes]
			.map((node) => ({
				id: node.id,
				primitive: node.primitive,
				params: node.params ?? null
			}))
			.sort((a, b) => a.id.localeCompare(b.id)),
		edges: [...doc.edges]
			.map((edge) => ({
				id: edge.id,
				from: edge.from,
				to: edge.to
			}))
			.sort((a, b) => a.id.localeCompare(b.id)),
		outputs: doc.outputs
	});

	return `${graphDigest}\x00${sourceDigest}`;
}
