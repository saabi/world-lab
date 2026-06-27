import type { CoordinateSpace, DataType, GraphDocument, Node, Port } from './types.js';

export type ValidationIssue =
	| { kind: 'unknown-node'; edge: string; node: string }
	| { kind: 'unknown-port'; edge: string; node: string; port: string }
	| { kind: 'bad-direction'; edge: string; end: 'from' | 'to' }
	| { kind: 'type-mismatch'; edge: string; from: DataType; to: DataType }
	| { kind: 'space-mismatch'; edge: string; from: CoordinateSpace; to: CoordinateSpace };

export interface ValidationResult {
	ok: boolean;
	issues: ValidationIssue[];
}

export function validateGraph(doc: GraphDocument): ValidationResult {
	const issues: ValidationIssue[] = [];

	const nodeMap = new Map<string, Node>();
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
	}

	const findPort = (node: Node, portId: string): Port | undefined =>
		[...node.inputs, ...node.outputs].find((p) => p.id === portId);

	for (const edge of doc.edges) {
		const fromNode = nodeMap.get(edge.from.node);
		const toNode = nodeMap.get(edge.to.node);

		if (!fromNode) {
			issues.push({ kind: 'unknown-node', edge: edge.id, node: edge.from.node });
		}
		if (!toNode) {
			issues.push({ kind: 'unknown-node', edge: edge.id, node: edge.to.node });
		}
		if (!fromNode || !toNode) continue;

		const fromPort = findPort(fromNode, edge.from.port);
		const toPort = findPort(toNode, edge.to.port);

		if (!fromPort) {
			issues.push({ kind: 'unknown-port', edge: edge.id, node: edge.from.node, port: edge.from.port });
		}
		if (!toPort) {
			issues.push({ kind: 'unknown-port', edge: edge.id, node: edge.to.node, port: edge.to.port });
		}
		if (!fromPort || !toPort) continue;

		if (fromPort.direction !== 'out') {
			issues.push({ kind: 'bad-direction', edge: edge.id, end: 'from' });
		}
		if (toPort.direction !== 'in') {
			issues.push({ kind: 'bad-direction', edge: edge.id, end: 'to' });
		}

		if (fromPort.dataType !== toPort.dataType) {
			issues.push({ kind: 'type-mismatch', edge: edge.id, from: fromPort.dataType, to: toPort.dataType });
		}

		const fromSpace: CoordinateSpace = fromPort.space ?? 'none';
		const toSpace: CoordinateSpace = toPort.space ?? 'none';
		if (fromSpace !== 'none' && toSpace !== 'none' && fromSpace !== toSpace) {
			issues.push({ kind: 'space-mismatch', edge: edge.id, from: fromSpace, to: toSpace });
		}
	}

	return { ok: issues.length === 0, issues };
}
