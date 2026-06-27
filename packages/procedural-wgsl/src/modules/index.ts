import type { WgslModule } from '@virtual-planet/compiler';

import { MATH_CLAMP_MODULE } from './math/clamp.js';
import { MATH_REMAP_MODULE } from './math/remap.js';
import { MATH_SMOOTHSTEP_MODULE } from './math/smoothstep.js';
import { NOISE_PERLIN3D_MODULE } from './noise/perlin3d.js';
import { PROCEDURAL_UV_MODULE } from './procedural/uv.js';
import { SURFACE_CUBE_SPHERE_MODULE } from './surface/cubeSphere.js';
import { SURFACE_PLANE_MODULE } from './surface/plane.js';

/** Stable module id → WGSL source for the procedural standard library. */
export const STANDARD_LIBRARY_MODULES: Record<string, WgslModule> = {
	[PROCEDURAL_UV_MODULE.id]: { ...PROCEDURAL_UV_MODULE },
	[NOISE_PERLIN3D_MODULE.id]: { ...NOISE_PERLIN3D_MODULE },
	[MATH_REMAP_MODULE.id]: { ...MATH_REMAP_MODULE },
	[MATH_CLAMP_MODULE.id]: { ...MATH_CLAMP_MODULE },
	[MATH_SMOOTHSTEP_MODULE.id]: { ...MATH_SMOOTHSTEP_MODULE },
	[SURFACE_PLANE_MODULE.id]: { ...SURFACE_PLANE_MODULE },
	[SURFACE_CUBE_SPHERE_MODULE.id]: { ...SURFACE_CUBE_SPHERE_MODULE }
};

export {
	MATH_CLAMP_MODULE,
	MATH_REMAP_MODULE,
	MATH_SMOOTHSTEP_MODULE,
	NOISE_PERLIN3D_MODULE,
	PROCEDURAL_UV_MODULE,
	SURFACE_CUBE_SPHERE_MODULE,
	SURFACE_PLANE_MODULE
};

export { MATH_CLAMP_SOURCE } from './math/clamp.js';
export { MATH_REMAP_SOURCE } from './math/remap.js';
export { MATH_SMOOTHSTEP_SOURCE } from './math/smoothstep.js';
export { NOISE_PERLIN3D_SOURCE } from './noise/perlin3d.js';
export { PROCEDURAL_UV_SOURCE } from './procedural/uv.js';
export { SURFACE_CUBE_SPHERE_SOURCE } from './surface/cubeSphere.js';
export { SURFACE_PLANE_SOURCE } from './surface/plane.js';
