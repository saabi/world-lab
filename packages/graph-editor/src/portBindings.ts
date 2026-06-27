import type { GraphDocument } from '@virtual-planet/graph';
import type { PortBindingState } from './types.js';

export function derivePortBindings(doc: GraphDocument, nodeId: string): PortBindingState[] {
	const node = doc.nodes.find((candidate) => candidate.id === nodeId);
	if (!node) return [];

	return node.inputs.map((port) => {
		const edge = doc.edges.find(
			(candidate) => candidate.to.node === nodeId && candidate.to.port === port.id
		);
		const source = edge
			? {
					kind: 'edge' as const,
					edgeId: edge.id,
					fromNode: edge.from.node,
					fromPort: edge.from.port
				}
			: { kind: 'unconnected' as const };

		return {
			portId: port.id,
			name: port.name,
			dataType: port.dataType,
			...(port.space !== undefined ? { space: port.space } : {}),
			source
		};
	});
}
