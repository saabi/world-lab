import type { CoordinateSpace, DataType } from './types.js';

/** A primitive's port declaration (a template; node instances get ids in the IR). */
export interface PortSpec {
	name: string;
	dataType: DataType;
	space?: CoordinateSpace;
}

export interface ParamSpec {
	name: string;
	type: 'f32' | 'i32' | 'bool';
	default: number | boolean;
	min?: number;
	max?: number;
}

/** Stable reference to the WGSL module that implements this primitive (declared, not used in M2). */
export interface WgslSourceRef {
	moduleId: string; // e.g. 'noise.perlin3d'
	entry: string; // e.g. 'perlin3d'
}

export type CpuValue = number | number[];

export interface CpuEvalContext {
	inputs: Record<string, CpuValue>;
	params: Record<string, number | boolean>;
}

export interface NodePrimitive {
	id: string; // e.g. 'noise.perlin3d'
	category: string;
	inputs: PortSpec[];
	outputs: PortSpec[];
	params: ParamSpec[];
	wgsl: WgslSourceRef;
	/** Optional CPU evaluator: returns each output by name. */
	evalCPU?: (ctx: CpuEvalContext) => Record<string, CpuValue>;
}
