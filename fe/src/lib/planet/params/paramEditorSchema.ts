import type { PlanetParameters } from './planetParams.js';
import type { AtmosphereParameters } from './atmosphereParams.js';

export interface ParamSliderDef {
	key: keyof PlanetParameters;
	label: string;
	min: number;
	max: number;
	step: number;
}

/** Boolean-style flag backed by a 0/1 numeric planet param. */
export interface ParamToggleDef {
	key: keyof PlanetParameters;
	label: string;
}

export interface ParamEditorSection {
	title: string;
	/** Collapsed by default when false. */
	defaultOpen?: boolean;
	sliders: ParamSliderDef[];
	toggles?: ParamToggleDef[];
}

/** Generative planet parameter groups, ordered coarse → fine → classification. */
export const PARAM_EDITOR_SECTIONS: ParamEditorSection[] = [
	{
		title: 'Planet Body',
		defaultOpen: true,
		sliders: [{ key: 'radius', label: 'Radius', min: 0, max: 3000, step: 1 }]
	},
	{
		title: 'Continents',
		defaultOpen: true,
		sliders: [
			{ key: 'voronoi_scale', label: 'Plate Scale', min: 0, max: 10, step: 0.1 },
			{ key: 'voronoi_amplitude', label: 'Elevation', min: 0, max: 50, step: 0.1 },
			{ key: 'voronoi_albedo', label: 'Color Spot 1', min: 0, max: 1, step: 0.01 },
			{ key: 'voronoi_albedo_y', label: 'Color Spot 2', min: 0, max: 1, step: 0.01 },
			{ key: 'voronoi_albedo_z', label: 'Color Spot 3', min: 0, max: 1, step: 0.01 }
		]
	},
	{
		title: 'Plate Warp',
		sliders: [
			{ key: 'voronoi_distortion_scale', label: 'Warp Scale', min: 0, max: 10, step: 0.1 },
			{ key: 'voronoi_distortion_amplitude', label: 'Warp Strength', min: 0, max: 50, step: 0.1 },
			{ key: 'voronoi_distortion_albedo', label: 'Warp Color', min: 0, max: 1, step: 0.01 }
		]
	},
	{
		title: 'Terrain Detail',
		sliders: [
			{ key: 'detail_scale', label: 'Scale', min: 0, max: 100, step: 0.1 },
			{ key: 'detail_amplitude', label: 'Height', min: 0, max: 50, step: 0.1 },
			{ key: 'detail_albedo', label: 'Color', min: 0, max: 1, step: 0.01 }
		]
	},
	{
		title: 'Surface Texture',
		sliders: [
			{ key: 'texture_noise_scale', label: 'Scale', min: 0, max: 10, step: 0.01 },
			{ key: 'texture_noise_amplitude', label: 'Strength', min: 0, max: 10, step: 0.01 }
		]
	},
	{
		title: 'Erosion',
		sliders: [{ key: 'erosion', label: 'Erosion Power', min: 0, max: 3, step: 0.01 }]
	},
	{
		title: 'Biome Bands',
		sliders: [
			{ key: 'sand_cutoff', label: 'Sand Line', min: 0, max: 1, step: 0.01 },
			{ key: 'vegetation_level', label: 'Vegetation Line', min: 0, max: 1, step: 0.01 },
			{ key: 'snow_cover', label: 'Snow Line', min: 0, max: 1, step: 0.01 }
		]
	},
	{
		title: 'Oceans',
		defaultOpen: true,
		sliders: [{ key: 'water_level', label: 'Sea Level', min: 0, max: 1, step: 0.01 }],
		toggles: [{ key: 'render_water', label: 'Render Water' }]
	},
	{
		title: 'Polar Caps',
		sliders: [
			{ key: 'polar_scale', label: 'Cap Extent', min: 0, max: 1, step: 0.01 },
			{ key: 'polar_amplitude', label: 'Cap Strength', min: 0, max: 20, step: 0.1 }
		]
	}
];

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
