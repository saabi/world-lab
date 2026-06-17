import {
	DEFAULT_MATERIAL_OVERRIDES,
	MATERIAL_DEBUG_MODE,
	type MaterialDebugMode,
	type MaterialOverrides
} from '../material/biomes.js';

export const MATERIAL_OVERRIDES_UNIFORM_SIZE = 32;

export function materialDebugToGpu(mode: MaterialDebugMode): number {
	return MATERIAL_DEBUG_MODE[mode];
}

export function writeMaterialOverrides(buffer: ArrayBuffer, o: MaterialOverrides): void {
	const view = new DataView(buffer);
	view.setFloat32(0, o.exposure, true);
	view.setFloat32(4, o.roughnessMult, true);
	view.setFloat32(8, o.waterGloss, true);
	view.setFloat32(12, materialDebugToGpu(o.materialDebug), true);
	view.setFloat32(16, o.fogDensity, true);
}

export function defaultMaterialOverrides(): MaterialOverrides {
	return { ...DEFAULT_MATERIAL_OVERRIDES };
}
