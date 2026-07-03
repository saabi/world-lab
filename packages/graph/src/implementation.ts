import type {
	GraphDocument,
	GroupDefinition,
	Node,
	PortRef
} from './types.js';

export type ShaderStage = 'vertex' | 'fragment' | 'compute';

export interface HostBinding {
	context:
		| 'invocation'
		| 'stage-builtin'
		| 'playback'
		| 'write-target'
		| 'read-resource'
		| 'interaction'
		| 'session';
	key: string;
	stages?: ShaderStage[];
}

export interface SinkInvocation<T = unknown> {
	sinkKind: string;
	nodeId: string;
	dependencies: PortRef[];
	payload: T;
}

export interface SinkDefinition {
	kind: string;
	deriveInvocation(doc: GraphDocument, node: Node): SinkInvocation | null;
}

export interface ResourceDescriptor {
	placeholder?: never;
}

export type GpuCommandKind = string;

export type PrimitiveImplementation =
	| { kind: 'wgsl-function'; moduleId: string; entry: string }
	| { kind: 'group'; groupId: string }
	| { kind: 'host-input'; binding: HostBinding }
	| { kind: 'legacy-structural'; marker: string }
	| { kind: 'sink'; sink: SinkDefinition }
	| { kind: 'resource'; descriptor: ResourceDescriptor }
	| { kind: 'kernel'; stage: ShaderStage }
	| { kind: 'command'; command: GpuCommandKind };

export interface GroupResolver {
	resolve(groupId: string): Promise<GroupDefinition>;
}

export interface SinkHandler {
	sinkKind: string;
}

export class SinkHandlerRegistry<TAdapter extends SinkHandler> {
	readonly #adapters = new Map<string, TAdapter>();

	register(adapter: TAdapter): void {
		if (this.#adapters.has(adapter.sinkKind)) {
			throw new Error(`Sink handler already registered: ${adapter.sinkKind}`);
		}
		this.#adapters.set(adapter.sinkKind, adapter);
	}

	get(sinkKind: string): TAdapter | undefined {
		return this.#adapters.get(sinkKind);
	}
}
