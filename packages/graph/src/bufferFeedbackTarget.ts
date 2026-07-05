import type { SinkDefinition } from './implementation.js';
import { getPrimitive } from './registry.js';
import type { GraphDocument, Node } from './types.js';

const BUFFER_FEEDBACK_ROLE = 'bufferFeedbackTarget';

export interface BufferFeedbackTargetDescriptor {
	sinkNodeId: string;
	gridWidth: number;
	gridHeight: number;
}

function positiveInteger(value: unknown, name: string, nodeId: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		throw new Error(
			`target.bufferFeedback node "${nodeId}" requires ${name} to be a positive integer`
		);
	}
	return value;
}

export function isBufferFeedbackTarget(node: Node): boolean {
	return getPrimitive(node.primitive)?.metadata?.role === BUFFER_FEEDBACK_ROLE;
}

export function bufferFeedbackTargetForNode(node: Node): BufferFeedbackTargetDescriptor {
	return {
		sinkNodeId: node.id,
		gridWidth: positiveInteger(node.params?.gridWidth, 'gridWidth', node.id),
		gridHeight: positiveInteger(node.params?.gridHeight, 'gridHeight', node.id)
	};
}

export const BUFFER_FEEDBACK_SINK_DEFINITION: SinkDefinition = {
	kind: 'bufferFeedback',
	deriveInvocation(_doc, node) {
		const payload = bufferFeedbackTargetForNode(node);
		return {
			sinkKind: 'bufferFeedback',
			nodeId: node.id,
			dependencies: [],
			payload
		};
	}
};

export function deriveBufferFeedbackTarget(
	doc: GraphDocument
): BufferFeedbackTargetDescriptor | null {
	const nodes = doc.nodes.filter(isBufferFeedbackTarget);
	if (nodes.length > 1) {
		throw new Error(
			`A graph may contain at most one target.bufferFeedback sink; found ${nodes.length}`
		);
	}
	const node = nodes[0];
	return node ? bufferFeedbackTargetForNode(node) : null;
}

export { BUFFER_FEEDBACK_ROLE };
