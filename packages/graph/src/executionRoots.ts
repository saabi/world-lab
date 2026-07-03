import { getPrimitive } from './registry.js';
import type { GraphDocument, Node } from './types.js';

export function discoverExecutionRoots(doc: GraphDocument): Node[] {
	return doc.nodes.filter((node) => getPrimitive(node.primitive)?.implementation.kind === 'sink');
}
