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
	[BIOME.water]: { roughness: 0.04, metallic: 0, ior: 1.33 },
	[BIOME.ice]: { roughness: 0.3, metallic: 0, ior: 1.31 }
};

export type MaterialDebugMode = 'off' | 'normals' | 'roughness' | 'metallic' | 'specular' | 'ibl';

export const MATERIAL_DEBUG_MODE: Record<MaterialDebugMode, number> = {
	off: 0,
	normals: 1,
	roughness: 2,
	metallic: 3,
	specular: 4,
	ibl: 5
};

export const MATERIAL_DEBUG_LABELS: { value: MaterialDebugMode; label: string }[] = [
	{ value: 'off', label: 'Off' },
	{ value: 'normals', label: 'Normals' },
	{ value: 'roughness', label: 'Roughness' },
	{ value: 'metallic', label: 'Metallic' },
	{ value: 'specular', label: 'Specular' },
	{ value: 'ibl', label: 'IBL' }
];

export interface MaterialOverrides {
	exposure: number;
	roughnessMult: number;
	waterGloss: number;
	materialDebug: MaterialDebugMode;
}

export const DEFAULT_MATERIAL_OVERRIDES: MaterialOverrides = {
	exposure: 1.0,
	roughnessMult: 1.0,
	waterGloss: 1.5,
	materialDebug: 'off'
};
