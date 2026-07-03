import type {
	ProceduralConsumer,
	SinkHandler,
	SinkInvocation
} from '@world-lab/graph';

export interface SinkCompilerAdapter extends SinkHandler {
	toConsumerDescriptor(invocation: SinkInvocation): ProceduralConsumer;
}
