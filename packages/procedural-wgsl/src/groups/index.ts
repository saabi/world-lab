import '@world-lab/graph';

import { buildGroupModule } from './buildGroupModule.js';
import { MATH_REMAP_GROUP } from './math.remap.js';
import { SDF_OP_SUBTRACT_GROUP } from './sdf.opSubtract.js';
import { TRANSFORM_NORMAL_DISPLACE_GROUP } from './transform.normalDisplace.js';
import { TRANSFORM_SPHERIFY_GROUP } from './transform.spherify.js';

/** Generated standard-library module for `math.remap`. */
export const MATH_REMAP_MODULE = buildGroupModule(MATH_REMAP_GROUP);

/** Generated standard-library module for `sdf.opSubtract`. */
export const SDF_OP_SUBTRACT_MODULE = buildGroupModule(SDF_OP_SUBTRACT_GROUP);

/** Generated standard-library module for `transform.spherify`. */
export const TRANSFORM_SPHERIFY_MODULE = buildGroupModule(TRANSFORM_SPHERIFY_GROUP);

/** Generated standard-library module for `transform.normalDisplace`. */
export const TRANSFORM_NORMAL_DISPLACE_MODULE = buildGroupModule(TRANSFORM_NORMAL_DISPLACE_GROUP);

export { MATH_REMAP_GROUP } from './math.remap.js';
export { SDF_OP_SUBTRACT_GROUP } from './sdf.opSubtract.js';
export { TRANSFORM_NORMAL_DISPLACE_GROUP } from './transform.normalDisplace.js';
export { TRANSFORM_SPHERIFY_GROUP } from './transform.spherify.js';
export {
	buildGroupModule,
	mathBinaryNode,
	mathUnaryNode,
	mathVec3UnaryNode,
	vectorAddVec3fNode,
	vectorMulScalarVec3fNode
} from './buildGroupModule.js';
