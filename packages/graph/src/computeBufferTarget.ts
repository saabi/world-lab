import type { KernelBindingTemplate } from './implementation.js';
import { getPrimitive } from './registry.js';
import type { GraphDocument, Node } from './types.js';

const COMPUTE_BUFFER_ROLE = 'computeBufferTarget';

export interface ComputeBufferTargetDescriptor {
	nodeId: string;
	elementCount: number;
	bindings: readonly KernelBindingTemplate[];
}

function positiveInteger(value: unknown, name: string, nodeId: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		throw new Error(
			`target.computeBuffer node "${nodeId}" requires ${name} to be a positive integer`
		);
	}
	return value;
}

export function isComputeBufferTarget(node: Node): boolean {
	return getPrimitive(node.primitive)?.metadata?.role === COMPUTE_BUFFER_ROLE;
}

export function computeBufferTargetForNode(node: Node): ComputeBufferTargetDescriptor {
	const primitive = getPrimitive(node.primitive);
	const implementation = primitive?.implementation;
	if (implementation?.kind !== 'kernel') {
		throw new Error(
			`target.computeBuffer node "${node.id}" must reference a kernel primitive`
		);
	}
	return {
		nodeId: node.id,
		elementCount: positiveInteger(node.params?.elementCount, 'elementCount', node.id),
		bindings: implementation.bindings
	};
}

export function deriveComputeBufferTarget(
	doc: GraphDocument
): ComputeBufferTargetDescriptor | null {
	const nodes = doc.nodes.filter(isComputeBufferTarget);
	if (nodes.length > 1) {
		throw new Error(
			`A graph may contain at most one target.computeBuffer sink; found ${nodes.length}`
		);
	}
	const node = nodes[0];
	return node ? computeBufferTargetForNode(node) : null;
}

export { COMPUTE_BUFFER_ROLE };
