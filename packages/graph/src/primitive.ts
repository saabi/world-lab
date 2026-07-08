import type { TSchema } from '@world-lab/schema';

import type { DataType, SemanticTag, SpaceId, TypeRef } from './types.js';
import type { PortDefaultValue } from './dataType.js';
import type { PrimitiveImplementation } from './implementation.js';

export type PipelineStageKind = 'vertex' | 'fragment';

export interface PrimitiveMetadata {
	description?: string;
	pure?: boolean;
	deterministic?: boolean;
	color?: string;
	icon?: string;
	keywords?: string[];
	/**
	 * Semantic role tag (e.g. 'positionTransform', 'colorSpace').
	 * When set, `swapFamily()` groups by role instead of mechanical contract,
	 * enabling swap families across differing port signatures.
	 */
	role?: string;
	/** Short help text shown in tooltips (replaces aliases — see node-model-design-notes §C). */
	help?: string;
	/** Extended usage/example text shown in inspector panels. */
	usage?: string;
	/**
	 * Pipeline stage kind recognized by structural pipeline discovery. Independent
	 * of `role`, which is used by swapFamily() for editor grouping.
	 */
	pipelineStageKind?: PipelineStageKind;
}

export interface PortMetadata {
	wgslType?: string;
	description?: string;
	semantic?: string;
	unit?: string;
	range?: readonly [number, number];
}

/** A primitive's port declaration (a template; node instances get ids in the IR). */
export interface PortSpec {
	name: string;
	type?: TypeRef;
	/** @deprecated Compatibility/display alias. */
	dataType?: DataType;
	space?: SpaceId;
	semantics?: SemanticTag[];
	metadata?: PortMetadata;
	/** Literal used when the input port has no incoming edge. */
	default?: PortDefaultValue;
}

export type PortSpecInput = Omit<PortSpec, 'type' | 'dataType'> &
	(
		| { type: TypeRef; dataType?: DataType }
		| { type?: never; dataType: DataType }
	);

export interface WgslArgumentBinding {
	name: string;
	source: 'input' | 'param';
}

/** Stable reference to the WGSL module that implements this primitive (declared, not used in M2). */
export interface WgslSourceRef {
	moduleId: string; // e.g. 'noise.perlin3d'
	entry: string; // e.g. 'perlin3d'
	arguments?: WgslArgumentBinding[];
}

export type CpuValue = number | number[];

export interface CpuEvalContext {
	inputs: Record<string, CpuValue>;
	params: Record<string, number | boolean>;
	/** Per-sample procedural/host inputs for CPU preview (e.g. plane UV). */
	procedural?: Record<string, CpuValue>;
}

export interface NodePrimitive {
	id: string; // e.g. 'noise.perlin3d'
	category: string;
	inputs: PortSpec[];
	outputs: PortSpec[];
	/** TypeBox object schema: the single source of truth for authored node parameters. */
	params: TSchema;
	implementation: PrimitiveImplementation;
	/** @deprecated Compatibility alias for WGSL function and group implementations. */
	wgsl?: WgslSourceRef;
	metadata?: PrimitiveMetadata;
	/** Optional CPU evaluator: returns each output by name. */
	evalCPU?: (ctx: CpuEvalContext) => Record<string, CpuValue>;
}

export function callableWgslSource(primitive: NodePrimitive): WgslSourceRef | undefined {
	if (
		primitive.implementation.kind !== 'wgsl-function' &&
		primitive.implementation.kind !== 'group'
	) {
		return undefined;
	}
	if (!primitive.wgsl) {
		throw new Error(`Callable primitive is missing its WGSL compatibility source: ${primitive.id}`);
	}
	return primitive.wgsl;
}

export type NodePrimitiveInput = Omit<
	NodePrimitive,
	'inputs' | 'outputs' | 'implementation' | 'wgsl'
> & {
	inputs: PortSpecInput[];
	outputs: PortSpecInput[];
} & (
		| { implementation: PrimitiveImplementation; wgsl?: WgslSourceRef }
		| { implementation?: never; wgsl: WgslSourceRef }
	);
