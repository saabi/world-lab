import '@virtual-planet/graph';

import { buildGroupModule } from './buildGroupModule.js';
import { MATH_REMAP_GROUP } from './math.remap.js';
import { SDF_OP_SUBTRACT_GROUP } from './sdf.opSubtract.js';

/** Generated standard-library module for `math.remap`. */
export const MATH_REMAP_MODULE = buildGroupModule(MATH_REMAP_GROUP);

/** Generated standard-library module for `sdf.opSubtract`. */
export const SDF_OP_SUBTRACT_MODULE = buildGroupModule(SDF_OP_SUBTRACT_GROUP);

export { MATH_REMAP_GROUP } from './math.remap.js';
export { SDF_OP_SUBTRACT_GROUP } from './sdf.opSubtract.js';
export { buildGroupModule, mathBinaryNode, mathUnaryNode } from './buildGroupModule.js';
