import type { TSchema } from '@world-lab/schema';

import type { DataType, SemanticTag, SpaceId } from './types.js';
import type { PortDefaultValue } from './dataType.js';

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
	dataType: DataType;
	space?: SpaceId;
	semantics?: SemanticTag[];
	metadata?: PortMetadata;
	/** Literal used when the input port has no incoming edge. */
	default?: PortDefaultValue;
}

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
	wgsl: WgslSourceRef;
	metadata?: PrimitiveMetadata;
	/** Optional CPU evaluator: returns each output by name. */
	evalCPU?: (ctx: CpuEvalContext) => Record<string, CpuValue>;
}
