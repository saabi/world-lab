import type {
	ResourceBinding,
	ResourceLifetime,
	ResourceShape
} from '@world-lab/graph';

export type TextureTargetSize =
	| { kind: 'screen-relative'; scale: number }
	| { kind: 'fixed'; width: number; height: number };

export interface BufferResourceTarget {
	id: string;
	shape: Extract<ResourceShape, { kind: 'buffer' }>;
	lifetime: ResourceLifetime;
	size: { kind: 'element-count'; count: number };
}

export interface TextureResourceTarget {
	id: string;
	shape: Extract<ResourceShape, { kind: 'texture' }>;
	lifetime: ResourceLifetime;
	size: TextureTargetSize;
}

export type ResourceTarget = BufferResourceTarget | TextureResourceTarget;

export interface ResourceRead {
	channel: number;
	target: string;
	version?: 'previous';
	sampler?: { filter: 'nearest' | 'linear'; wrap: 'clamp' | 'repeat' };
}

export interface Pass {
	consumerId: string;
	writeTarget: string;
	reads: ResourceRead[];
	bindings?: ResourceBinding[];
	iterations?: number;
	pure?: boolean;
}

export interface PassGraph {
	targets: ResourceTarget[];
	passes: Pass[];
	display: string;
	readbackTargets?: readonly string[];
}
