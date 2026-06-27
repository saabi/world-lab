import type { Edge, GraphDocument, GraphOutput, Node } from '@virtual-planet/graph';

export interface SliceRequest {
	outputs: string[]; // names referencing GraphDocument.outputs
}

export interface GraphSlice {
	nodes: Node[]; // minimal set, in the document's original node order
	edges: Edge[]; // only edges whose both endpoints are in `nodes`, original order
	outputs: GraphOutput[]; // the requested outputs, resolved
}

export function sliceGraph(doc: GraphDocument, request: SliceRequest): GraphSlice {
	const resolvedOutputs: GraphOutput[] = [];
	const needed = new Set<string>();

	for (const name of request.outputs) {
		const output = doc.outputs.find((o) => o.name === name);
		if (!output) {
			throw new Error(`Unknown output: ${name}`);
		}
		resolvedOutputs.push(output);
		needed.add(output.from.node);
	}

	let changed = true;
	while (changed) {
		changed = false;
		for (const nodeId of [...needed]) {
			for (const edge of doc.edges) {
				if (edge.to.node === nodeId && !needed.has(edge.from.node)) {
					needed.add(edge.from.node);
					changed = true;
				}
			}
		}
	}

	const nodes = doc.nodes.filter((n) => needed.has(n.id));
	const edges = doc.edges.filter((e) => needed.has(e.from.node) && needed.has(e.to.node));

	return { nodes, edges, outputs: resolvedOutputs };
}
