import { getPrimitive } from './registry.js';
import type { GraphDocument, Node, PortRef } from './types.js';

const MESH_TARGET_ROLE = 'meshTarget';

export interface MeshTargetDescriptor {
	meshNodeId: string;
	position: PortRef;
	normal: PortRef;
	gridSize: number;
	faceCount: number;
}

function incomingEdge(doc: GraphDocument, nodeId: string, port: string) {
	return doc.edges.find((edge) => edge.to.node === nodeId && edge.to.port === port);
}

/** Whether `node` is a mesh preview sink (e.g. `target.mesh`). */
export function isMeshTarget(node: Node): boolean {
	const primitive = getPrimitive(node.primitive);
	return primitive?.metadata?.role === MESH_TARGET_ROLE;
}

/** Wired mesh sinks with both position and normal inputs connected. */
export function deriveMeshTargets(doc: GraphDocument): MeshTargetDescriptor[] {
	const descriptors: MeshTargetDescriptor[] = [];

	for (const node of doc.nodes) {
		if (!isMeshTarget(node)) continue;

		const positionEdge = incomingEdge(doc, node.id, 'position');
		const normalEdge = incomingEdge(doc, node.id, 'normal');
		if (!positionEdge || !normalEdge) continue;

		const params = node.params ?? {};
		const gridSize = typeof params.gridSize === 'number' ? params.gridSize : 24;
		const faceCount = typeof params.faceCount === 'number' ? params.faceCount : 1;

		descriptors.push({
			meshNodeId: node.id,
			position: positionEdge.from,
			normal: normalEdge.from,
			gridSize,
			faceCount
		});
	}

	return descriptors;
}
