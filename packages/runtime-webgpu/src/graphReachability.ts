import type { GraphDocument } from '@world-lab/graph';

export function parseChannelIndex(value: unknown, context: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 3) {
		throw new Error(
			`${context}: invalid channel index ${JSON.stringify(value)} (expected an integer 0-3)`
		);
	}
	return value;
}

/** Topologically sorted node ids reachable upstream of `outputNodeId`, including the output. */
export function upstreamNodeIds(doc: GraphDocument, outputNodeId: string): string[] {
	const nodeMap = new Map(doc.nodes.map((node) => [node.id, node]));
	const incoming = new Map<string, Set<string>>();
	for (const node of doc.nodes) incoming.set(node.id, new Set());
	for (const edge of doc.edges) {
		if (!nodeMap.has(edge.from.node) || !nodeMap.has(edge.to.node)) continue;
		incoming.get(edge.to.node)?.add(edge.from.node);
	}

	const sorted: string[] = [];
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (nodeId: string): void => {
		if (visited.has(nodeId)) return;
		if (visiting.has(nodeId)) throw new Error(`Graph cycle detected at node: ${nodeId}`);
		visiting.add(nodeId);
		for (const upstreamId of incoming.get(nodeId) ?? []) visit(upstreamId);
		visiting.delete(nodeId);
		visited.add(nodeId);
		sorted.push(nodeId);
	};

	if (!nodeMap.has(outputNodeId)) throw new Error(`Unknown output node: ${outputNodeId}`);
	visit(outputNodeId);
	return sorted;
}
