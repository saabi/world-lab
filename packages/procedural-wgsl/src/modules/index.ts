import type { WgslModule } from '@virtual-planet/compiler';

import { MATH_ADD_MODULE } from './math/add.js';
import { MATH_CLAMP_MODULE } from './math/clamp.js';
import { MATH_MIX_MODULE } from './math/mix.js';
import { MATH_MULTIPLY_MODULE } from './math/multiply.js';
import { MATH_POW_MODULE } from './math/pow.js';
import { MATH_REMAP_MODULE } from './math/remap.js';
import { MATH_SMOOTHSTEP_MODULE } from './math/smoothstep.js';
import { NOISE_FBM_MODULE } from './noise/fbm.js';
import { NOISE_PERLIN3D_MODULE } from './noise/perlin3d.js';
import { NOISE_WORLEY_MODULE } from './noise/worley.js';
import { PROCEDURAL_UV_MODULE } from './procedural/uv.js';
import { SURFACE_CUBE_SPHERE_MODULE } from './surface/cubeSphere.js';
import { SURFACE_PLANE_MODULE } from './surface/plane.js';

/** Stable module id → WGSL source for the procedural standard library. */
export const STANDARD_LIBRARY_MODULES: Record<string, WgslModule> = {
	[PROCEDURAL_UV_MODULE.id]: { ...PROCEDURAL_UV_MODULE },
	[NOISE_PERLIN3D_MODULE.id]: { ...NOISE_PERLIN3D_MODULE },
	[NOISE_WORLEY_MODULE.id]: { ...NOISE_WORLEY_MODULE },
	[NOISE_FBM_MODULE.id]: {
		id: NOISE_FBM_MODULE.id,
		source: NOISE_FBM_MODULE.source,
		dependencies: [...NOISE_FBM_MODULE.dependencies]
	},
	[MATH_REMAP_MODULE.id]: { ...MATH_REMAP_MODULE },
	[MATH_CLAMP_MODULE.id]: { ...MATH_CLAMP_MODULE },
	[MATH_SMOOTHSTEP_MODULE.id]: { ...MATH_SMOOTHSTEP_MODULE },
	[MATH_ADD_MODULE.id]: { ...MATH_ADD_MODULE },
	[MATH_MULTIPLY_MODULE.id]: { ...MATH_MULTIPLY_MODULE },
	[MATH_MIX_MODULE.id]: { ...MATH_MIX_MODULE },
	[MATH_POW_MODULE.id]: { ...MATH_POW_MODULE },
	[SURFACE_PLANE_MODULE.id]: { ...SURFACE_PLANE_MODULE },
	[SURFACE_CUBE_SPHERE_MODULE.id]: { ...SURFACE_CUBE_SPHERE_MODULE }
};

export {
	MATH_ADD_MODULE,
	MATH_CLAMP_MODULE,
	MATH_MIX_MODULE,
	MATH_MULTIPLY_MODULE,
	MATH_POW_MODULE,
	MATH_REMAP_MODULE,
	MATH_SMOOTHSTEP_MODULE,
	NOISE_FBM_MODULE,
	NOISE_PERLIN3D_MODULE,
	NOISE_WORLEY_MODULE,
	PROCEDURAL_UV_MODULE,
	SURFACE_CUBE_SPHERE_MODULE,
	SURFACE_PLANE_MODULE
};

export { MATH_ADD_SOURCE } from './math/add.js';
export { MATH_CLAMP_SOURCE } from './math/clamp.js';
export { MATH_MIX_SOURCE } from './math/mix.js';
export { MATH_MULTIPLY_SOURCE } from './math/multiply.js';
export { MATH_POW_SOURCE } from './math/pow.js';
export { MATH_REMAP_SOURCE } from './math/remap.js';
export { MATH_SMOOTHSTEP_SOURCE } from './math/smoothstep.js';
export { NOISE_FBM_SOURCE } from './noise/fbm.js';
export { NOISE_PERLIN3D_SOURCE } from './noise/perlin3d.js';
export { NOISE_WORLEY_SOURCE } from './noise/worley.js';
export { PROCEDURAL_UV_SOURCE } from './procedural/uv.js';
export { SURFACE_CUBE_SPHERE_SOURCE } from './surface/cubeSphere.js';
export { SURFACE_PLANE_SOURCE } from './surface/plane.js';
