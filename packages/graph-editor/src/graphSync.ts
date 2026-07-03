import { getPrimitive, type GraphDocument, type Node, type NodePrimitive } from '@world-lab/graph';

import { instantiateNodeInputs, instantiateNodeOutputs } from './nodePortUtils.js';

function syncNodePorts(node: Node, primitive: NodePrimitive): Node {
	return {
		...node,
		inputs: instantiateNodeInputs(primitive),
		outputs: instantiateNodeOutputs(primitive)
	};
}

function findInputPort(node: Node, portId: string) {
	return node.inputs.find((port) => port.id === portId);
}

function findOutputPort(node: Node, portId: string) {
	return node.outputs.find((port) => port.id === portId);
}

/** Rewire edges and graph outputs when a node has a single port and the ref is stale. */
export function repairStalePortRefs(doc: GraphDocument): GraphDocument {
	const edges = doc.edges.map((edge) => {
		let from = edge.from;
		let to = edge.to;
		const fromNode = doc.nodes.find((node) => node.id === from.node);
		const toNode = doc.nodes.find((node) => node.id === to.node);

		if (fromNode && !findOutputPort(fromNode, from.port) && fromNode.outputs.length === 1) {
			from = { node: from.node, port: fromNode.outputs[0]!.id };
		}
		if (toNode && !findInputPort(toNode, to.port) && toNode.inputs.length === 1) {
			to = { node: to.node, port: toNode.inputs[0]!.id };
		}

		return from === edge.from && to === edge.to ? edge : { ...edge, from, to };
	});

	const outputs = doc.outputs.map((output) => {
		const node = doc.nodes.find((candidate) => candidate.id === output.from.node);
		if (node && !findOutputPort(node, output.from.port) && node.outputs.length === 1) {
			return {
				...output,
				from: { node: output.from.node, port: node.outputs[0]!.id }
			};
		}
		return output;
	});

	const changed =
		edges.some((edge, index) => edge !== doc.edges[index]) ||
		outputs.some((output, index) => output !== doc.outputs[index]);

	if (!changed) return doc;
	return { ...doc, edges, outputs };
}

/** Refresh node input/output metadata from the live primitive registry (keeps params, edges, ids). */
export function resyncGraphPortMetadata(doc: GraphDocument): GraphDocument {
	return repairStalePortRefs({
		...doc,
		nodes: doc.nodes.map((node) => {
			const primitive = getPrimitive(node.primitive);
			return primitive ? syncNodePorts(node, primitive) : node;
		})
	});
}
