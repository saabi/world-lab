import { Type } from '@world-lab/schema';

import type { SinkDefinition, SinkInvocation } from '../../implementation.js';
import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import type {
	GraphDocument,
	Node,
	PipelineStage,
	PortRef,
	ProceduralConsumer
} from '../../types.js';

function resolveOutputs(doc: GraphDocument, outputNames: readonly string[]): PortRef[] {
	return outputNames.flatMap((name) => {
		const output = doc.outputs.find((candidate) => candidate.name === name);
		return output ? [output.from] : [];
	});
}

export interface FieldPreviewSinkPayload {
	outputName: string;
}

export interface LegacyConsumerSinkPayload extends ProceduralConsumer {}

export const FIELD_PREVIEW_SINK_DEFINITION: SinkDefinition = {
	kind: 'fieldPreview',
	deriveInvocation(doc, node): SinkInvocation<FieldPreviewSinkPayload> | null {
		const outputName = node.params?.outputName;
		if (typeof outputName !== 'string') return null;
		return {
			sinkKind: 'fieldPreview',
			nodeId: node.id,
			dependencies: resolveOutputs(doc, [outputName]),
			payload: { outputName }
		};
	}
};

export const LEGACY_CONSUMER_SINK_DEFINITION: SinkDefinition = {
	kind: 'legacyConsumer',
	deriveInvocation(doc, node): SinkInvocation<LegacyConsumerSinkPayload> | null {
		const type = node.params?.type;
		const outputs = node.params?.outputs;
		const stage = node.params?.stage;
		if (
			typeof type !== 'string' ||
			!Array.isArray(outputs) ||
			!outputs.every((output): output is string => typeof output === 'string') ||
			(stage !== undefined && typeof stage !== 'string')
		) {
			return null;
		}
		const payload: LegacyConsumerSinkPayload = {
			type,
			outputs,
			...(typeof node.params?.id === 'string' ? { id: node.params.id } : {}),
			...(stage !== undefined ? { stage: stage as PipelineStage } : {})
		};
		return {
			sinkKind: 'legacyConsumer',
			nodeId: node.id,
			dependencies: resolveOutputs(doc, outputs),
			payload
		};
	}
};

const primitives: NodePrimitiveInput[] = [
	{
		id: 'preview.fieldSink',
		category: 'target/sink',
		inputs: [],
		outputs: [],
		params: Type.Object({
			outputName: Type.String({ default: '' })
		}),
		implementation: { kind: 'sink', sink: FIELD_PREVIEW_SINK_DEFINITION },
		metadata: {
			description: 'Compatibility sink for previewing a named graph output.',
			role: 'compatibilitySink'
		}
	},
	{
		id: 'legacy.consumerSink',
		category: 'target/sink',
		inputs: [],
		outputs: [],
		params: Type.Object({
			type: Type.String({ default: '' }),
			id: Type.Optional(Type.String()),
			stage: Type.Optional(Type.String()),
			outputs: Type.Array(Type.String(), { default: [] })
		}),
		implementation: { kind: 'sink', sink: LEGACY_CONSUMER_SINK_DEFINITION },
		metadata: {
			description: 'Compatibility sink preserving a legacy consumer descriptor.',
			role: 'compatibilitySink'
		}
	}
];

for (const primitive of primitives) registerPrimitive(primitive);
