import type { NodePrimitive } from '@virtual-planet/graph';

export interface NodeInspectorHelp {
	summary: string;
	usage?: string;
}

/** Resolve compact inspector copy from primitive metadata. */
export function resolveNodeInspectorHelp(primitive: NodePrimitive): NodeInspectorHelp {
	const summary = primitive.metadata?.help ?? primitive.metadata?.description ?? '';
	const usage = primitive.metadata?.usage;
	return usage ? { summary, usage } : { summary };
}
