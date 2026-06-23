import {
	DEFAULT_MATERIAL_OVERRIDES,
	type MaterialOverrides
} from '$lib/planet/material/biomes.js';
import {
	DEFAULT_TESSELLATION,
	type TessellationSettings
} from '$lib/planet/patches/tessellationSettings.js';
import { DEFAULT_ATMOSPHERE_INTEGRATE_STEPS } from '$lib/planet/scene/bodyAtmosphere.js';
import { DEFAULT_LOD_THRESHOLDS, type LodThresholds } from '$lib/planet/scene/bodyParams.js';

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

export interface SceneViewportPrefs {
	debug: ViewportDebugSettings;
	atmosphere: SceneAtmosphereSettings;
	tessellation: TessellationSettings;
	materialOverrides: MaterialOverrides;
	/** Ray-march step count for the atmosphere volume integral (global render quality). */
	atmosphereIntegrateSteps: number;
	/** Screen-size LOD thresholds (projected radius px); global, not per-body. */
	lod: LodThresholds;
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
		tessellation: { ...DEFAULT_TESSELLATION },
		materialOverrides: { ...DEFAULT_MATERIAL_OVERRIDES },
		atmosphereIntegrateSteps: DEFAULT_ATMOSPHERE_INTEGRATE_STEPS,
		lod: { ...DEFAULT_LOD_THRESHOLDS }
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
	void t.detail;
	void t.vertexBudgetMillions;
	void t.maxPatchResolution;
	void t.maxDepth;
	void m.shadows;
	void m.shadowFill;
	void m.exposure;
	void m.roughnessMult;
	void m.waterGloss;
	void m.fogDensity;
	void p.atmosphereIntegrateSteps;
	void p.lod.sphereAboveRadiusPx;
	void p.lod.proceduralAboveRadiusPx;
}
