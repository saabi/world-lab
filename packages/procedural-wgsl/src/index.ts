// @virtual-planet/procedural-wgsl — Standard library of reusable WGSL function modules (noise, terrain, vegetation, math).
//
// WGSL modules resolved by stable id; browser-safe TS template strings (no node:fs).

export const PROCEDURAL_WGSL_PACKAGE = '@virtual-planet/procedural-wgsl' as const;

export { STANDARD_LIBRARY_MODULES } from './modules/index.js';
export {
	MATH_CLAMP_MODULE,
	MATH_CLAMP_SOURCE,
	MATH_REMAP_MODULE,
	MATH_REMAP_SOURCE,
	MATH_SMOOTHSTEP_MODULE,
	MATH_SMOOTHSTEP_SOURCE,
	NOISE_PERLIN3D_MODULE,
	NOISE_PERLIN3D_SOURCE,
	PROCEDURAL_UV_MODULE,
	PROCEDURAL_UV_SOURCE,
	SURFACE_CUBE_SPHERE_MODULE,
	SURFACE_CUBE_SPHERE_SOURCE,
	SURFACE_PLANE_MODULE,
	SURFACE_PLANE_SOURCE
} from './modules/index.js';
export { createStandardLibraryResolver } from './resolver.js';
