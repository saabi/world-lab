/** CPU mirror of biome ids in material.wgsl — keep in sync. */
export const BIOME = {
	rock: 0,
	vegetation: 1,
	sand: 2,
	water: 3,
	ice: 4
} as const;

export type BiomeId = (typeof BIOME)[keyof typeof BIOME];

export interface BiomeProps {
	roughness: number;
	metallic: number;
	ior: number;
}

export const BIOME_PROPS: Record<BiomeId, BiomeProps> = {
	[BIOME.rock]: { roughness: 0.9, metallic: 0, ior: 1.0 },
	[BIOME.vegetation]: { roughness: 0.8, metallic: 0, ior: 1.0 },
	[BIOME.sand]: { roughness: 0.6, metallic: 0, ior: 1.0 },
	[BIOME.water]: { roughness: 0.06, metallic: 0, ior: 1.33 },
	[BIOME.ice]: { roughness: 0.3, metallic: 0, ior: 1.31 }
};

export type MaterialDebugMode =
	| 'off'
	| 'normals'
	| 'roughness'
	| 'metallic'
	| 'specular'
	| 'ibl'
	| 'bodyDir'
	| 'latLong'
	| 'belowSeaLevel'
	| 'seaLevelOffset';

export const MATERIAL_DEBUG_MODE: Record<MaterialDebugMode, number> = {
	off: 0,
	normals: 1,
	roughness: 2,
	metallic: 3,
	specular: 4,
	ibl: 5,
	// Parity diagnostics (see _docs/ideal-sphere-fragment-sampling.md): visualize the
	// body-frame fragment coordinate. Stable across tessellation only once fragment
	// sampling uses the ideal-sphere coordinate; today the interpolated value warps.
	bodyDir: 6,
	latLong: 7,
	belowSeaLevel: 8,
	seaLevelOffset: 9
};

export const MATERIAL_DEBUG_LABELS: { value: MaterialDebugMode; label: string }[] = [
	{ value: 'off', label: 'Off' },
	{ value: 'normals', label: 'Normals' },
	{ value: 'roughness', label: 'Roughness' },
	{ value: 'metallic', label: 'Metallic' },
	{ value: 'specular', label: 'Specular' },
	{ value: 'ibl', label: 'IBL' },
	{ value: 'bodyDir', label: 'Body dir (RGB)' },
	{ value: 'latLong', label: 'Lat/long grid' },
	{ value: 'belowSeaLevel', label: 'Below sea level (terrain)' },
	{ value: 'seaLevelOffset', label: 'Sea level offset (terrain)' }
];

export interface MaterialOverrides {
	exposure: number;
	roughnessMult: number;
	waterGloss: number;
	waterWaveStrength: number;
	waterGlintStrength: number;
	waterAbsorptionStrength: number;
	waterFoamStrength: number;
	waterShoreWidth: number;
	materialDebug: MaterialDebugMode;
	fogDensity: number;
	/** Terrain self-shadows for the directional sun. */
	shadows: boolean;
	/** Sun light retained inside shadows (0 = black, 1 = none); fakes scattered fill past the fold. */
	shadowFill: number;
	/** Terrain fragment alpha (0..1). 1 = fully opaque (/planet and /scene). */
	objectOpacity: number;
	/** Fragment macro relief scale (scene LOD height transition). */
	heightBlend: number;
	/** Vertex radial displacement scale (scene LOD terrain transition). */
	displacementBlend: number;
}

export const DEFAULT_MATERIAL_OVERRIDES: MaterialOverrides = {
	exposure: 1.0,
	roughnessMult: 1.0,
	waterGloss: 1.5,
	waterWaveStrength: 0.75,
	waterGlintStrength: 1.0,
	waterAbsorptionStrength: 1.0,
	waterFoamStrength: 0.35,
	waterShoreWidth: 0.25,
	materialDebug: 'off',
	fogDensity: 0.8,
	shadows: true,
	shadowFill: 0.15,
	objectOpacity: 1.0,
	heightBlend: 1.0,
	displacementBlend: 1.0
};
