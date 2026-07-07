import type {
	GraphDocument,
	GroupDefinition,
	Node,
	PortRef,
	TypeRef
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

export type ResourceLifetime =
	| { kind: 'transient' }
	| { kind: 'persistent' }
	| { kind: 'history'; slots: 2 };

export type ResourceShape = Extract<
	TypeRef,
	{ kind: 'buffer' | 'texture' | 'sampler' }
>;

export interface ResourceTemplate {
	shape: ResourceShape;
	lifetime: ResourceLifetime;
}

export interface ResourceInstance extends ResourceTemplate {
	id: string;
}

export type ResourceAccess = 'read' | 'write' | 'read-write';

export interface ResourceBinding {
	resourceId: string;
	access: ResourceAccess;
}

export type KernelResourceKind = ResourceShape['kind'];

export interface KernelBindingTemplate {
	name: string;
	binding: number;
	resourceKind: KernelResourceKind;
	access: ResourceAccess;
	stages: readonly ShaderStage[];
}

export interface ResolvedKernelBinding extends ResourceBinding {
	name: string;
	binding: number;
	resourceKind: KernelResourceKind;
	stages: readonly ShaderStage[];
}

export type GpuCommandKind = string;

export type PrimitiveImplementation =
	| { kind: 'wgsl-function'; moduleId: string; entry: string }
	| { kind: 'group'; groupId: string }
	| { kind: 'host-input'; binding: HostBinding }
	| { kind: 'legacy-structural'; marker: string }
	| { kind: 'sink'; sink: SinkDefinition }
	| { kind: 'resource'; template: ResourceTemplate }
	| { kind: 'kernel'; stage: ShaderStage; bindings: readonly KernelBindingTemplate[] }
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
