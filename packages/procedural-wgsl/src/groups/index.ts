import '@world-lab/graph';

import { buildGroupModule } from './buildGroupModule.js';
import { MATH_REMAP_GROUP } from './math.remap.js';
import { SDF_OP_SUBTRACT_GROUP } from './sdf.opSubtract.js';
import { TRANSFORM_NORMAL_DISPLACE_GROUP } from './transform.normalDisplace.js';
import { TRANSFORM_SCALE_GROUP } from './transform.scale.js';
import { TRANSFORM_SPHERIFY_GROUP } from './transform.spherify.js';
import { TRANSFORM_TRANSLATE_GROUP } from './transform.translate.js';

/** Generated standard-library module for `math.remap`. */
export const MATH_REMAP_MODULE = buildGroupModule(MATH_REMAP_GROUP);

/** Generated standard-library module for `sdf.opSubtract`. */
export const SDF_OP_SUBTRACT_MODULE = buildGroupModule(SDF_OP_SUBTRACT_GROUP);

/** Generated standard-library module for `transform.spherify`. */
export const TRANSFORM_SPHERIFY_MODULE = buildGroupModule(TRANSFORM_SPHERIFY_GROUP);

/** Generated standard-library module for `transform.normalDisplace`. */
export const TRANSFORM_NORMAL_DISPLACE_MODULE = buildGroupModule(TRANSFORM_NORMAL_DISPLACE_GROUP);

/** Generated standard-library module for `transform.translate`. */
export const TRANSFORM_TRANSLATE_MODULE = buildGroupModule(TRANSFORM_TRANSLATE_GROUP);

/** Generated standard-library module for `transform.scale`. */
export const TRANSFORM_SCALE_MODULE = buildGroupModule(TRANSFORM_SCALE_GROUP);

export { MATH_REMAP_GROUP } from './math.remap.js';
export { SDF_OP_SUBTRACT_GROUP } from './sdf.opSubtract.js';
export { TRANSFORM_NORMAL_DISPLACE_GROUP } from './transform.normalDisplace.js';
export { TRANSFORM_SCALE_GROUP } from './transform.scale.js';
export { TRANSFORM_SPHERIFY_GROUP } from './transform.spherify.js';
export { TRANSFORM_TRANSLATE_GROUP } from './transform.translate.js';
export {
	buildGroupModule,
	mathBinaryNode,
	mathUnaryNode,
	mathVec3UnaryNode,
	vectorAddVec3fNode,
	vectorMulScalarVec3fNode
} from './buildGroupModule.js';
