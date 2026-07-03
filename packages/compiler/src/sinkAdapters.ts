import type {
	GraphDocument,
	LegacyConsumerSinkPayload,
	ProceduralConsumer,
	SinkHandler,
	SinkInvocation
} from '@world-lab/graph';
import { discoverExecutionRoots, getPrimitive } from '@world-lab/graph';
import type { WgslModuleResolver } from './codegen.js';
import {
	compileConsumers,
	type GraphCompileResult
} from './compileGraph.js';

export interface SinkCompilerAdapter extends SinkHandler {
	toConsumerDescriptor(invocation: SinkInvocation): ProceduralConsumer;
}

export const LEGACY_CONSUMER_COMPILER_ADAPTER: SinkCompilerAdapter = {
	sinkKind: 'legacyConsumer',
	toConsumerDescriptor(invocation): ProceduralConsumer {
		if (invocation.sinkKind !== 'legacyConsumer') {
			throw new Error(`Expected legacyConsumer invocation, got ${invocation.sinkKind}`);
		}
		const payload = invocation.payload as LegacyConsumerSinkPayload;
		return {
			type: payload.type,
			outputs: [...payload.outputs],
			...(payload.id !== undefined ? { id: payload.id } : {}),
			...(payload.stage !== undefined ? { stage: payload.stage } : {})
		};
	}
};

/** Resolve all compatibility sinks before compiling so shared modules stay globally visible. */
export function legacyConsumerDescriptors(doc: GraphDocument): ProceduralConsumer[] {
	return discoverExecutionRoots(doc).flatMap((node) => {
		const primitive = getPrimitive(node.primitive);
		if (primitive?.implementation.kind !== 'sink') return [];
		const invocation = primitive.implementation.sink.deriveInvocation(doc, node);
		return invocation?.sinkKind === LEGACY_CONSUMER_COMPILER_ADAPTER.sinkKind
			? [LEGACY_CONSUMER_COMPILER_ADAPTER.toConsumerDescriptor(invocation)]
			: [];
	});
}

export function compileLegacyConsumerSinks(
	doc: GraphDocument,
	resolver: WgslModuleResolver
): Promise<GraphCompileResult> {
	return compileConsumers(doc, legacyConsumerDescriptors(doc), resolver);
}
