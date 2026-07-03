import {
	derivePipelinePresentations,
	effectiveOutputs,
	isPipelineTarget,
	type DataType,
	type GraphDocument,
	type PortRef
} from '@world-lab/graph';

import { outputPortDataType } from './graphBuilders.js';

export type PreviewFamily = 'geometry' | 'image' | 'data' | 'audio';

export type PreviewBufferSource = PortRef | { sinkNode: string };

export interface PreviewBuffer {
	id: string;
	label: string;
	source: PreviewBufferSource;
	dataType: DataType;
	family: PreviewFamily;
	/** When false the buffer family is ambiguous (e.g. vec4f colour field) — show the picker. */
	inferred: boolean;
}

const ALL_DATA_TYPES: readonly DataType[] = [
	'f32',
	'vec2f',
	'vec3f',
	'vec4f',
	'bool',
	'image',
	'mesh',
	'audio',
	'geometry',
	'varyings',
	'texture',
	'vertexBuffer',
	'indexBuffer',
	'renderTarget',
	'bindGroup',
	'storageBuffer',
	'list<f32>',
	'list<vec2f>',
	'list<vec3f>',
	'list<vec4f>'
];

function portKey(ref: PortRef): string {
	return `${ref.node}:${ref.port}`;
}

function sourcePortKey(source: PreviewBufferSource): string {
	return 'node' in source ? portKey(source) : `sink:${source.sinkNode}`;
}

function labelForNode(doc: GraphDocument, nodeId: string): string {
	const node = doc.nodes.find((candidate) => candidate.id === nodeId);
	return node?.name?.trim() || node?.primitive || nodeId;
}

function bufferFromOutput(doc: GraphDocument, name: string, from: PortRef): PreviewBuffer {
	const dataType = (outputPortDataType(doc, from) ?? 'f32') as DataType;
	const family = previewFamily(dataType);
	return {
		id: name,
		label: name,
		source: from,
		dataType,
		family,
		inferred: dataType !== 'vec4f'
	};
}

function bufferFromPipelineSink(
	doc: GraphDocument,
	displayNodeId: string,
	fieldOutput: PortRef | null
): PreviewBuffer {
	const baseLabel = labelForNode(doc, displayNodeId);
	const label = fieldOutput
		? `${baseLabel} · ${fieldOutput.node}.${fieldOutput.port}`
		: baseLabel;
	if (fieldOutput) {
		return {
			id: displayNodeId,
			label,
			source: fieldOutput,
			dataType: 'vec4f',
			family: 'image',
			inferred: true
		};
	}
	return {
		id: displayNodeId,
		label,
		source: { sinkNode: displayNodeId },
		dataType: 'texture',
		family: 'image',
		inferred: true
	};
}

function presentationCountForField(
	presentations: ReturnType<typeof derivePipelinePresentations>,
	fieldKey: string
): number {
	return presentations.filter((presentation) => portKey(presentation.fieldOutput) === fieldKey)
		.length;
}

/** Map a port `DataType` to a preview family (exhaustive over the `DataType` union). */
export function previewFamily(dataType: DataType): PreviewFamily {
	switch (dataType) {
		case 'image':
		case 'texture':
		case 'renderTarget':
			return 'image';
		case 'geometry':
		case 'mesh':
		case 'vertexBuffer':
		case 'indexBuffer':
		case 'varyings':
			return 'geometry';
		case 'audio':
			return 'audio';
		case 'f32':
		case 'vec2f':
		case 'vec3f':
		case 'vec4f':
		case 'bool':
		case 'list<f32>':
		case 'list<vec2f>':
		case 'list<vec3f>':
		case 'list<vec4f>':
		case 'storageBuffer':
		case 'bindGroup':
			return 'data';
		default: {
			const _exhaustive: never = dataType;
			return _exhaustive;
		}
	}
}

/** Every `DataType` variant maps through `previewFamily` without throwing. */
export function allPreviewFamilyDataTypes(): readonly DataType[] {
	return ALL_DATA_TYPES;
}

/** Declared value outputs plus one buffer per pipeline render-target sink. */
export function enumeratePreviewBuffers(doc: GraphDocument): PreviewBuffer[] {
	const buffers: PreviewBuffer[] = [];
	const presentations = derivePipelinePresentations(doc);
	const pipelineFieldKeys = new Set(presentations.map((presentation) => portKey(presentation.fieldOutput)));

	const seenValueKeys = new Set<string>();
	for (const output of effectiveOutputs(doc)) {
		const fieldKey = portKey(output.from);
		if (pipelineFieldKeys.has(fieldKey)) continue;
		if (seenValueKeys.has(fieldKey)) continue;
		seenValueKeys.add(fieldKey);
		buffers.push(bufferFromOutput(doc, output.name, output.from));
	}

	const declaredPipelineOutputs = doc.outputs.filter((output) =>
		pipelineFieldKeys.has(portKey(output.from))
	);
	const seenDeclaredNames = new Set<string>();
	for (const output of declaredPipelineOutputs) {
		const fieldKey = portKey(output.from);
		if (presentationCountForField(presentations, fieldKey) > 1) continue;
		if (seenDeclaredNames.has(output.name)) continue;
		seenDeclaredNames.add(output.name);
		// Keep `id` on the synthetic output name (pipeline_image[_<sinkId>]) — it's the stable
		// persistence key — but prefer the display sink's own name for the label, if one is set.
		const presentation = presentations.find(
			(candidate) => portKey(candidate.fieldOutput) === fieldKey
		);
		const displayNode = presentation
			? doc.nodes.find((node) => node.id === presentation.displayNodeId)
			: undefined;
		const label = displayNode?.name?.trim() || output.name;
		buffers.push({
			...bufferFromOutput(doc, output.name, output.from),
			label,
			family: 'image',
			inferred: true
		});
	}

	const seenSinkIds = new Set<string>();
	for (const node of doc.nodes) {
		if (!isPipelineTarget(node)) continue;
		if (seenSinkIds.has(node.id)) continue;
		seenSinkIds.add(node.id);

		const presentation = presentations.find((candidate) => candidate.displayNodeId === node.id);
		const fieldKey = presentation ? portKey(presentation.fieldOutput) : null;
		if (
			fieldKey &&
			presentationCountForField(presentations, fieldKey) === 1 &&
			declaredPipelineOutputs.some((output) => portKey(output.from) === fieldKey)
		) {
			continue;
		}

		buffers.push(bufferFromPipelineSink(doc, node.id, presentation?.fieldOutput ?? null));
	}

	return buffers;
}

/** Resolve the port a buffer preview should evaluate (field colour for pipeline sinks). */
export function resolvePreviewBufferPort(
	doc: GraphDocument,
	buffer: PreviewBuffer
): PortRef | null {
	if ('node' in buffer.source) return buffer.source;
	const sinkNode = buffer.source.sinkNode;
	const presentation = derivePipelinePresentations(doc).find(
		(candidate) => candidate.displayNodeId === sinkNode
	);
	return presentation?.fieldOutput ?? null;
}

/** Pick the first buffer / a sensible default when nothing is selected yet. */
export function inferDefaultPreviewBuffer(doc: GraphDocument): PreviewBuffer | null {
	const buffers = enumeratePreviewBuffers(doc);
	if (buffers.length === 0) return null;
	return buffers.find((buffer) => buffer.family === 'image') ?? buffers[0]!;
}

/** Family after an optional user override (falls back to the buffer's own family). */
export function effectivePreviewFamily(
	buffer: Pick<PreviewBuffer, 'family'>,
	override: PreviewFamily | null | undefined
): PreviewFamily {
	return override ?? buffer.family;
}

/** Stable key for persisting the selected buffer across reloads. */
export function previewBufferPersistenceKey(buffer: PreviewBuffer): string {
	return buffer.id;
}

export function findPreviewBufferById(
	doc: GraphDocument,
	bufferId: string | null | undefined
): PreviewBuffer | null {
	if (!bufferId) return null;
	return enumeratePreviewBuffers(doc).find((buffer) => buffer.id === bufferId) ?? null;
}

/** Dedup helper exposed for tests. */
export function previewBufferSourceKey(source: PreviewBufferSource): string {
	return sourcePortKey(source);
}
