import type { PlanetParameters } from './planetParams.js';
import type { AtmosphereParameters } from './atmosphereParams.js';

export interface ParamSliderDef {
	key: keyof PlanetParameters;
	label: string;
	min: number;
	max: number;
	step: number;
	/** Render with a logarithmic slider — for values spanning many orders of magnitude. */
	log?: boolean;
}

/** Boolean-style flag backed by a 0/1 numeric planet param. */
export interface ParamToggleDef {
	key: keyof PlanetParameters;
	label: string;
}

export type EditorSuperSectionId =
	| 'camera'
	| 'shape'
	| 'materials'
	| 'atmosphere'
	| 'tessellation'
	| 'debug';

export interface EditorSuperSectionDef {
	id: EditorSuperSectionId;
	title: string;
	/** Open on first load when true (accordion picks the first match). */
	defaultOpen?: boolean;
}

/** Top-level accordion groups in AppearanceEditor shape sections. */
export const EDITOR_SUPER_SECTIONS: EditorSuperSectionDef[] = [
	{ id: 'camera', title: 'Camera', defaultOpen: true },
	{ id: 'shape', title: 'Shape' },
	{ id: 'materials', title: 'Materials' },
	{ id: 'atmosphere', title: 'Atmosphere' },
	{ id: 'tessellation', title: 'Tessellation' },
	{ id: 'debug', title: 'Debug' }
];

export interface ParamEditorSection {
	title: string;
	/** Which accordion super section owns this block. */
	group: EditorSuperSectionId;
	/** Collapsed by default when false. */
	defaultOpen?: boolean;
	sliders: ParamSliderDef[];
	toggles?: ParamToggleDef[];
}

/** Generative planet parameter groups, ordered coarse → fine → classification. */
export const PARAM_EDITOR_SECTIONS: ParamEditorSection[] = [
	{
		title: 'Planet Body',
		group: 'shape',
		defaultOpen: true,
		// Log scale: 1 m (boulder) → 1e9 m (~star). Meteor ~1e3, Moon ~1.7e6,
		// Earth ~6.4e6, Jupiter ~7e7, Sun ~7e8.
		sliders: [{ key: 'radius', label: 'Radius', min: 1, max: 1_000_000_000, step: 1, log: true }]
	},
	{
		title: 'Continents',
		group: 'shape',
		defaultOpen: true,
		sliders: [
			{ key: 'voronoi_scale', label: 'Plate Scale', min: 0, max: 10, step: 0.1 },
			{ key: 'voronoi_amplitude', label: 'Elevation', min: 0, max: 0.5, step: 0.001 },
			{ key: 'voronoi_albedo', label: 'Color Spot 1', min: 0, max: 1, step: 0.01 },
			{ key: 'voronoi_albedo_y', label: 'Color Spot 2', min: 0, max: 1, step: 0.01 },
			{ key: 'voronoi_albedo_z', label: 'Color Spot 3', min: 0, max: 1, step: 0.01 }
		]
	},
	{
		title: 'Plate Warp',
		group: 'shape',
		sliders: [
			{ key: 'voronoi_distortion_scale', label: 'Warp Scale', min: 0, max: 10, step: 0.1 },
			{ key: 'voronoi_distortion_amplitude', label: 'Warp Strength', min: 0, max: 50, step: 0.1 },
			{ key: 'voronoi_distortion_albedo', label: 'Warp Color', min: 0, max: 1, step: 0.01 }
		]
	},
	{
		title: 'Terrain Detail',
		group: 'shape',
		sliders: [
			{ key: 'detail_scale', label: 'Scale', min: 0, max: 100, step: 0.1 },
			{ key: 'detail_amplitude', label: 'Height', min: 0, max: 0.5, step: 0.001 },
			{ key: 'detail_albedo', label: 'Color', min: 0, max: 1, step: 0.01 }
		]
	},
	{
		title: 'Surface Texture',
		group: 'shape',
		sliders: [
			{ key: 'texture_noise_scale', label: 'Scale', min: 0, max: 10, step: 0.01 },
			{ key: 'texture_noise_amplitude', label: 'Strength', min: 0, max: 0.1, step: 0.001 }
		]
	},
	{
		title: 'Erosion',
		group: 'shape',
		sliders: [{ key: 'erosion', label: 'Erosion Power', min: 0, max: 3, step: 0.01 }]
	},
	{
		title: 'Biome Bands',
		group: 'materials',
		sliders: [
			{ key: 'sand_cutoff', label: 'Sand Line', min: 0, max: 1, step: 0.01 },
			{ key: 'vegetation_level', label: 'Vegetation Line', min: 0, max: 1, step: 0.01 },
			{ key: 'snow_cover', label: 'Snow Line', min: 0, max: 1, step: 0.01 }
		]
	},
	{
		title: 'Oceans',
		group: 'shape',
		defaultOpen: true,
		sliders: [{ key: 'water_level', label: 'Sea Level', min: 0, max: 1, step: 0.01 }],
		toggles: [{ key: 'render_water', label: 'Render Water' }]
	},
	{
		title: 'Polar Caps',
		group: 'shape',
		sliders: [
			{ key: 'polar_scale', label: 'Cap Extent', min: 0, max: 1, step: 0.01 },
			{ key: 'polar_amplitude', label: 'Cap Strength', min: 0, max: 0.3, step: 0.001 }
		]
	}
];

/** Param blocks belonging to a super section (preserves PARAM_EDITOR_SECTIONS order). */
export function paramSectionsForGroup(group: EditorSuperSectionId): ParamEditorSection[] {
	return PARAM_EDITOR_SECTIONS.filter((s) => s.group === group);
}

export interface AtmosphereSliderDef {
	key: Exclude<keyof AtmosphereParameters, 'enabled'>;
	label: string;
	min: number;
	max: number;
	step: number;
}

/**
 * Atmosphere sliders. Shell/scale heights are absolute meters, so their ranges
 * are derived from the current planet radius to stay usable across planet sizes.
 */
export function atmosphereSliders(radius: number): AtmosphereSliderDef[] {
	const r = Math.max(radius, 1);
	return [
		{ key: 'shellHeightMeters', label: 'Atmosphere Height', min: 0, max: r * 0.6, step: r * 0.005 },
		{ key: 'scaleHeightMeters', label: 'Density Falloff', min: 0, max: r * 0.4, step: r * 0.002 },
		{ key: 'rayleighStrength', label: 'Sky (Rayleigh)', min: 0, max: 4, step: 0.05 },
		{ key: 'mieStrength', label: 'Haze (Mie)', min: 0, max: 4, step: 0.05 },
		{ key: 'mieG', label: 'Haze Direction', min: 0, max: 0.99, step: 0.01 },
		{ key: 'groundFogDensity', label: 'Ground Fog', min: 0, max: 3, step: 0.05 },
		{ key: 'sunDiskIntensity', label: 'Sun Brightness', min: 0, max: 60, step: 0.5 },
		{ key: 'integrateSteps', label: 'Quality', min: 4, max: 64, step: 1 }
	];
}

/** Body-atmosphere design sliders (excludes render-quality `integrateSteps`). */
export type BodyAtmosphereSliderKey = Exclude<AtmosphereSliderDef['key'], 'integrateSteps'>;

export function bodyAtmosphereSliders(radius: number): (AtmosphereSliderDef & { key: BodyAtmosphereSliderKey })[] {
	return atmosphereSliders(radius).filter(
		(s): s is AtmosphereSliderDef & { key: BodyAtmosphereSliderKey } => s.key !== 'integrateSteps'
	);
}
