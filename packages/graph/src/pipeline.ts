import { getPrimitive } from './registry.js';
import { discoverExecutionRoots } from './executionRoots.js';
import type { SinkDefinition } from './implementation.js';
import type {
	GraphDocument,
	GraphOutput,
	Node,
	PortRef,
	ProceduralConsumer
} from './types.js';

const PIPELINE_TARGET_ROLE = 'pipelineTarget';

/** Synthetic output name for a structurally derived pipeline image consumer. */
export const PIPELINE_IMAGE_OUTPUT_NAME = 'pipeline_image';

export interface PipelinePresentation {
	displayNodeId: string;
	outputName: string;
	fieldOutput: PortRef;
	consumer: ProceduralConsumer;
}

function incomingEdge(doc: GraphDocument, nodeId: string, port: string) {
	return doc.edges.find((edge) => edge.to.node === nodeId && edge.to.port === port);
}

/** Field colour port wired into the fragment stage for a display sink, if complete. */
function fieldOutputForDisplay(doc: GraphDocument, displayNode: Node): PortRef | null {
	const toDisplay = incomingEdge(doc, displayNode.id, 'color');
	if (!toDisplay) return null;

	const fragmentNode = doc.nodes.find((node) => node.id === toDisplay.from.node);
	if (!fragmentNode || fragmentNode.primitive !== 'stage.fragment') return null;
	if (toDisplay.from.port !== 'texture') return null;

	const fieldEdge = incomingEdge(doc, fragmentNode.id, 'color');
	return fieldEdge?.from ?? null;
}

function countPipelinePresentations(doc: GraphDocument): number {
	let count = 0;
	for (const node of doc.nodes) {
		if (!isPipelineTarget(node)) continue;
		if (fieldOutputForDisplay(doc, node)) count += 1;
	}
	return count;
}

function outputNameForField(
	doc: GraphDocument,
	fieldOutput: PortRef,
	displayNodeId: string
): string {
	const existing = doc.outputs.find(
		(candidate) =>
			candidate.from.node === fieldOutput.node && candidate.from.port === fieldOutput.port
	);
	if (existing) return existing.name;
	if (countPipelinePresentations(doc) > 1) {
		return `${PIPELINE_IMAGE_OUTPUT_NAME}_${displayNodeId}`;
	}
	return PIPELINE_IMAGE_OUTPUT_NAME;
}

export function presentationForDisplay(
	doc: GraphDocument,
	displayNode: Node
): PipelinePresentation | null {
	const fieldOutput = fieldOutputForDisplay(doc, displayNode);
	if (!fieldOutput) return null;

	const outputName = outputNameForField(doc, fieldOutput, displayNode.id);
	return {
		displayNodeId: displayNode.id,
		outputName,
		fieldOutput,
		consumer: {
			type: 'image',
			id: `pipeline:${displayNode.id}`,
			stage: 'fragment',
			outputs: [outputName]
		}
	};
}

export const DISPLAY_SINK_DEFINITION: SinkDefinition = {
	kind: 'display',
	deriveInvocation(doc, node) {
		const payload = presentationForDisplay(doc, node);
		if (!payload) return null;
		return {
			sinkKind: 'display',
			nodeId: node.id,
			dependencies: [payload.fieldOutput],
			payload
		};
	}
};

/** Structural pipeline chains that terminate at a render target (e.g. display ← fragment ← field). */
export function derivePipelinePresentations(doc: GraphDocument): PipelinePresentation[] {
	const presentations: PipelinePresentation[] = [];
	for (const node of doc.nodes) {
		if (!isPipelineTarget(node)) continue;
		const presentation = presentationForDisplay(doc, node);
		if (presentation) presentations.push(presentation);
	}
	return presentations;
}

/** First complete pipeline presentation, if any. */
export function tryPipelinePresentation(doc: GraphDocument): PipelinePresentation | null {
	return derivePipelinePresentations(doc)[0] ?? null;
}

/** Field output wired into the fragment stage (for preview / compile when doc.outputs is empty). */
export function pipelineFieldOutput(doc: GraphDocument): PortRef | null {
	return tryPipelinePresentation(doc)?.fieldOutput ?? null;
}

/** Image consumers implied by wired pipeline render targets. */
export function derivePipelineConsumers(doc: GraphDocument): ProceduralConsumer[] {
	return derivePipelinePresentations(doc).map((presentation) => presentation.consumer);
}

export function effectiveOutputs(doc: GraphDocument): GraphOutput[] {
	const outputs = [...doc.outputs];
	for (const presentation of derivePipelinePresentations(doc)) {
		const exists = outputs.some((candidate) => candidate.name === presentation.outputName);
		if (!exists) {
			outputs.push({ name: presentation.outputName, from: presentation.fieldOutput });
		}
	}
	return outputs;
}

function consumerKey(consumer: ProceduralConsumer): string {
	return `${consumer.id ?? ''}:${consumer.stage ?? ''}:${consumer.type}:${consumer.outputs.join(',')}`;
}

function sinkConsumers(doc: GraphDocument): ProceduralConsumer[] {
	return discoverExecutionRoots(doc).flatMap((node) => {
		const primitive = getPrimitive(node.primitive);
		if (primitive?.implementation.kind !== 'sink') return [];
		const invocation = primitive.implementation.sink.deriveInvocation(doc, node);
		if (!invocation) return [];

		if (invocation.sinkKind === 'display') {
			const consumer = (invocation.payload as PipelinePresentation).consumer;
			return consumer ? [consumer] : [];
		}
		if (invocation.sinkKind === 'fieldPreview') {
			const outputName = (invocation.payload as { outputName?: unknown }).outputName;
			return typeof outputName === 'string'
				? [{ type: 'preview', outputs: [outputName] }]
				: [];
		}
		if (invocation.sinkKind === 'legacyConsumer') {
			const consumer = invocation.payload as ProceduralConsumer;
			return Array.isArray(consumer.outputs) ? [consumer] : [];
		}
		return [];
	});
}

/** Consumer descriptors represented by reachable sink nodes (deduped). */
export function effectiveConsumers(doc: GraphDocument): ProceduralConsumer[] {
	const merged: ProceduralConsumer[] = [];
	const seen = new Set<string>();
	for (const consumer of sinkConsumers(doc)) {
		const key = consumerKey(consumer);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(consumer);
	}
	return merged;
}

/** Compile/preview view with structurally derived pipeline outputs merged in. */
export function effectiveGraphDocument(doc: GraphDocument): GraphDocument {
	return {
		...doc,
		outputs: effectiveOutputs(doc)
	};
}

/** Whether `node` is a pipeline render sink (e.g. `target.display`). */
export function isPipelineTarget(node: Node): boolean {
	const primitive = getPrimitive(node.primitive);
	return primitive?.metadata?.role === PIPELINE_TARGET_ROLE;
}

/** Node ids that terminate the graph — declared value outputs ∪ pipeline render targets. */
export function outputSinkNodeIds(doc: GraphDocument): string[] {
	const nodeIds = new Set(doc.nodes.map((node) => node.id));
	const sinks = new Set<string>();

	for (const output of doc.outputs) {
		if (nodeIds.has(output.from.node)) {
			sinks.add(output.from.node);
		}
	}

	for (const node of discoverExecutionRoots(doc)) {
		sinks.add(node.id);
	}

	return [...sinks];
}
