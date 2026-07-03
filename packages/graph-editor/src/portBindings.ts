import { getPrimitive, resolveInputPortDefault, type GraphDocument } from '@world-lab/graph';
import type { PortBindingState } from './types.js';

function formatDefaultLabel(value: unknown): string {
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return String(value);
	if (Array.isArray(value)) return `[${value.join(', ')}]`;
	return String(value);
}

export function derivePortBindings(doc: GraphDocument, nodeId: string): PortBindingState[] {
	const node = doc.nodes.find((candidate) => candidate.id === nodeId);
	if (!node) return [];
	const primitive = getPrimitive(node.primitive);

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
			: (() => {
					const portDefault = resolveInputPortDefault(node, port, primitive);
					if (portDefault !== undefined) {
						return { kind: 'default' as const, value: portDefault };
					}
					return { kind: 'unconnected' as const };
				})();

		return {
			portId: port.id,
			name: port.name,
				dataType: port.dataType,
				...(port.space !== undefined ? { space: port.space } : {}),
				...(port.semantics !== undefined ? { semantics: [...port.semantics] } : {}),
				source
		};
	});
}

export { formatDefaultLabel };
