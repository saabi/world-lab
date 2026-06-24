import {
	DEFAULT_MATERIAL_OVERRIDES,
	type MaterialOverrides
} from '$lib/planet/material/biomes.js';
import {
	DEFAULT_TESSELLATION,
	type TessellationSettings
} from '$lib/planet/patches/tessellationSettings.js';
import { DEFAULT_ATMOSPHERE_INTEGRATE_STEPS } from '$lib/planet/scene/bodyAtmosphere.js';
import {
	DEFAULT_FADE_GAMMA,
	DEFAULT_LOD_THRESHOLDS,
	type LodThresholds,
	type LodTransitionMode
} from '$lib/planet/scene/bodyParams.js';

/** LOD thresholds plus transition controls — the "Level of detail" settings group. */
export interface SceneLodSettings extends LodThresholds {
	/** Gamma (>=1) on the terrain-band transition; higher biases visibility toward smooth mesh. */
	fadeGamma: number;
	/** Which channels ramp during the terrain band (sphere starts → terrain full). */
	transitionMode: LodTransitionMode;
}

export interface ViewportDebugSettings {
	wireframe: boolean;
	faceColors: boolean;
	showPatchBorders: boolean;
	showRingColors: boolean;
}

export type SceneAtmosphereBlendMode = 'explicit-composite' | 'hardware-alpha';

export interface SceneAtmosphereSettings {
	blendMode: SceneAtmosphereBlendMode;
}

export type OrbitPathOverlayMode = 'off' | 'all' | 'selected';

export interface SceneOverlaySettings {
	/** View filter: hide atmosphere shells without mutating body data. */
	showAtmospheres: boolean;
	/** Which orbit ellipse overlays to draw in 3D/2D. */
	orbitPaths: OrbitPathOverlayMode;
	/** Selection ring and other non-data editor highlights in the viewports. */
	showEditorAids: boolean;
}

export interface SceneViewportPrefs {
	debug: ViewportDebugSettings;
	atmosphere: SceneAtmosphereSettings;
	overlays: SceneOverlaySettings;
	tessellation: TessellationSettings;
	materialOverrides: MaterialOverrides;
	/** Ray-march step count for the atmosphere volume integral (global render quality). */
	atmosphereIntegrateSteps: number;
	/** Screen-size LOD thresholds + transition; global, not per-body. */
	lod: SceneLodSettings;
	/** Eclipse-shadow contrast: gain on the occluded sun fraction. 1 = physical, >1 darker
	 *  (wider umbra), <1 softer. Applies to terrain, spheres, and atmospheres. */
	eclipseContrast: number;
}

export function createDefaultViewportPrefs(): SceneViewportPrefs {
	return {
		debug: {
			wireframe: false,
			faceColors: false,
			showPatchBorders: false,
			showRingColors: false
		},
		atmosphere: {
			blendMode: 'explicit-composite'
		},
		overlays: {
			showAtmospheres: true,
			orbitPaths: 'all',
			showEditorAids: true
		},
		tessellation: { ...DEFAULT_TESSELLATION },
		materialOverrides: { ...DEFAULT_MATERIAL_OVERRIDES },
		atmosphereIntegrateSteps: DEFAULT_ATMOSPHERE_INTEGRATE_STEPS,
		lod: {
			...DEFAULT_LOD_THRESHOLDS,
			fadeGamma: DEFAULT_FADE_GAMMA,
			transitionMode: 'both'
		},
		eclipseContrast: 1
	};
}

/** Read every pref field that affects procedural rendering (for render-loop deps). */
export function viewportPrefsRenderDeps(p: SceneViewportPrefs | undefined): void {
	if (!p) return;
	const { debug: d, atmosphere: a, tessellation: t, materialOverrides: m } = p;
	void d.wireframe;
	void d.faceColors;
	void d.showPatchBorders;
	void d.showRingColors;
	void a.blendMode;
	void p.overlays.showAtmospheres;
	void p.overlays.orbitPaths;
	void p.overlays.showEditorAids;
	void t.detail;
	void t.vertexBudgetMillions;
	void t.maxPatchResolution;
	void t.maxDepth;
	void m.shadows;
	void m.shadowFill;
	void m.exposure;
	void m.roughnessMult;
	void m.waterGloss;
	void m.waterWaveStrength;
	void m.waterGlintStrength;
	void m.waterAbsorptionStrength;
	void m.waterFoamStrength;
	void m.waterShoreWidth;
	void m.fogDensity;
	void p.atmosphereIntegrateSteps;
	void p.lod.sphereAboveRadiusPx;
	void p.lod.proceduralAboveRadiusPx;
	void p.lod.proceduralFullRadiusPx;
	void p.lod.fadeGamma;
	void p.lod.transitionMode;
	void p.eclipseContrast;
}
