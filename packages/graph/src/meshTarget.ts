import { getPrimitive } from './registry.js';
import type { SinkDefinition } from './implementation.js';
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

export function meshTargetForNode(
	doc: GraphDocument,
	node: Node
): MeshTargetDescriptor | null {
	const positionEdge = incomingEdge(doc, node.id, 'position');
	const normalEdge = incomingEdge(doc, node.id, 'normal');
	if (!positionEdge || !normalEdge) return null;

	const params = node.params ?? {};
	return {
		meshNodeId: node.id,
		position: positionEdge.from,
		normal: normalEdge.from,
		gridSize: typeof params.gridSize === 'number' ? params.gridSize : 24,
		faceCount: typeof params.faceCount === 'number' ? params.faceCount : 1
	};
}

export const MESH_SINK_DEFINITION: SinkDefinition = {
	kind: 'meshPreview',
	deriveInvocation(doc, node) {
		const payload = meshTargetForNode(doc, node);
		if (!payload) return null;
		return {
			sinkKind: 'meshPreview',
			nodeId: node.id,
			dependencies: [payload.position, payload.normal],
			payload
		};
	}
};

/** Wired mesh sinks with both position and normal inputs connected. */
export function deriveMeshTargets(doc: GraphDocument): MeshTargetDescriptor[] {
	const descriptors: MeshTargetDescriptor[] = [];

	for (const node of doc.nodes) {
		if (!isMeshTarget(node)) continue;
		const descriptor = meshTargetForNode(doc, node);
		if (descriptor) descriptors.push(descriptor);
	}

	return descriptors;
}
