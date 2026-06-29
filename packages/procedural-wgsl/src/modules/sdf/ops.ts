import { SDF_OP_SUBTRACT_MODULE } from '../../groups/index.js';

/** WGSL module `sdf.opUnion` — CSG union (reauthored). */
export const SDF_OP_UNION_SOURCE = `/*---
id: sdf.opUnion
entry: opUnion
category: SDF
group: Geometry
source: reauthored
sourceSymbol: opUnion
---*/
fn opUnion(a: f32, b: f32) -> f32 {
	return min(a, b);
}`;

export const SDF_OP_UNION_MODULE = {
	id: 'sdf.opUnion',
	source: SDF_OP_UNION_SOURCE
} as const;

/** WGSL module `sdf.opSubtract` — generated from canonical group (max + negate). */
export { SDF_OP_SUBTRACT_MODULE };
export const SDF_OP_SUBTRACT_SOURCE = SDF_OP_SUBTRACT_MODULE.source;

/** WGSL module `sdf.opIntersect` — CSG intersection (reauthored). */
export const SDF_OP_INTERSECT_SOURCE = `/*---
id: sdf.opIntersect
entry: opIntersect
category: SDF
group: Geometry
source: reauthored
sourceSymbol: opIntersect
---*/
fn opIntersect(a: f32, b: f32) -> f32 {
	return max(a, b);
}`;

export const SDF_OP_INTERSECT_MODULE = {
	id: 'sdf.opIntersect',
	source: SDF_OP_INTERSECT_SOURCE
} as const;
