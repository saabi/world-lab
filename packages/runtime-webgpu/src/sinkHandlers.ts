import type { SinkHandler, SinkInvocation } from '@world-lab/graph';

export interface SinkExecutionContext {
	device: GPUDevice;
}

export interface SinkExecutionHandler extends SinkHandler {
	execute(invocation: SinkInvocation, context: SinkExecutionContext): void | Promise<void>;
}
