import type { NodePrimitive, PortSpec } from '@virtual-planet/graph';

export interface NodeInspectorHelp {
	summary: string;
	usage?: string;
}

function formatPortTypes(ports: readonly PortSpec[]): string {
	if (ports.length === 0) return '';
	return ports.map((port) => port.dataType).join(', ');
}

/** Last-resort summary when neither help nor description is authored. */
export function generateInspectorSummary(primitive: NodePrimitive): string {
	const inputs = formatPortTypes(primitive.inputs) || 'no inputs';
	const outputs = formatPortTypes(primitive.outputs) || 'no outputs';
	return `${primitive.category} primitive · ${inputs} → ${outputs}`;
}

/** Resolve compact inspector copy from primitive metadata. */
export function resolveNodeInspectorHelp(primitive: NodePrimitive): NodeInspectorHelp {
	const summary =
		primitive.metadata?.help ??
		primitive.metadata?.description ??
		generateInspectorSummary(primitive);
	const usage = primitive.metadata?.usage;
	return usage ? { summary, usage } : { summary };
}
