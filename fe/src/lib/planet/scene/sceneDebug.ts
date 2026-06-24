import { MATERIAL_DEBUG_LABELS, type MaterialDebugMode } from '../material/biomes.js';

export type SceneAtmosphereDebugMode =
	| 'atmosphereWhite'
	| 'atmosphereInscatter'
	| 'atmosphereTransmittance'
	| 'atmosphereViewSun'
	| 'atmosphereSurfaceMask';

export type SceneWaterDebugMode =
	| 'waterOnBlack'
	| 'waterUnlit'
	| 'waterDepthTest'
	| 'waterThickness'
	| 'waterShore'
	| 'waterWaveNormal'
	| 'waterFoam';

export type SceneDebugMode = MaterialDebugMode | SceneAtmosphereDebugMode | SceneWaterDebugMode;

export const SCENE_DEBUG_LABELS: { value: SceneDebugMode; label: string }[] = [
	...MATERIAL_DEBUG_LABELS,
	{ value: 'atmosphereWhite', label: 'Atmosphere on white' },
	{ value: 'atmosphereInscatter', label: 'Atmosphere inscatter' },
	{ value: 'atmosphereTransmittance', label: 'Atmosphere transmittance' },
	{ value: 'atmosphereViewSun', label: 'Atmosphere view/sun' },
	{ value: 'atmosphereSurfaceMask', label: 'Atmosphere surface mask' },
	{ value: 'waterOnBlack', label: 'Water on black' },
	{ value: 'waterUnlit', label: 'Water unlit (flat)' },
	{ value: 'waterDepthTest', label: 'Water depth test' },
	{ value: 'waterThickness', label: 'Water thickness' },
	{ value: 'waterShore', label: 'Water shore factor' },
	{ value: 'waterWaveNormal', label: 'Water wave normals' },
	{ value: 'waterFoam', label: 'Water foam mask' }
];

export function sceneMaterialDebugMode(mode: SceneDebugMode): MaterialDebugMode {
	if (isSceneAtmosphereDebugMode(mode)) return 'off';
	if (isSceneWaterDebugMode(mode)) return 'off';
	return mode as MaterialDebugMode;
}

export function isSceneAtmosphereDebugMode(mode: SceneDebugMode): mode is SceneAtmosphereDebugMode {
	return mode.startsWith('atmosphere');
}

export function isSceneWaterDebugMode(mode: SceneDebugMode): mode is SceneWaterDebugMode {
	return (
		mode === 'waterOnBlack' ||
		mode === 'waterUnlit' ||
		mode === 'waterDepthTest' ||
		mode === 'waterThickness' ||
		mode === 'waterShore' ||
		mode === 'waterWaveNormal' ||
		mode === 'waterFoam'
	);
}

export function waterDebugOnBlack(mode: SceneDebugMode): boolean {
	return mode === 'waterOnBlack';
}

export function waterDebugUnlit(mode: SceneDebugMode): boolean {
	return mode === 'waterUnlit';
}

export function waterDebugDepthTest(mode: SceneDebugMode): boolean {
	return mode === 'waterDepthTest';
}

export function sceneWaterDebugToGpu(mode: SceneDebugMode): number {
	if (mode === 'waterOnBlack' || mode === 'waterUnlit') return 1;
	if (mode === 'waterThickness') return 3;
	if (mode === 'waterShore') return 4;
	if (mode === 'waterWaveNormal') return 5;
	if (mode === 'waterFoam') return 6;
	return 0;
}

export function sceneAtmosphereDebugToGpu(mode: SceneDebugMode): number {
	switch (mode) {
		case 'atmosphereInscatter':
			return 1;
		case 'atmosphereTransmittance':
			return 2;
		case 'atmosphereViewSun':
			return 3;
		case 'atmosphereSurfaceMask':
			return 4;
		default:
			return 0;
	}
}
