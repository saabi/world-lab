import {
	DEFAULT_MATERIAL_OVERRIDES,
	MATERIAL_DEBUG_MODE,
	type MaterialDebugMode,
	type MaterialOverrides
} from '../material/biomes.js';

export const MATERIAL_OVERRIDES_UNIFORM_SIZE = 48;

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
	view.setFloat32(20, o.shadows ? 1 : 0, true);
	view.setFloat32(24, o.shadowFill, true);
	view.setFloat32(28, o.objectOpacity, true);
	view.setFloat32(32, o.heightBlend, true);
	view.setFloat32(36, o.displacementBlend, true);
	view.setFloat32(40, o.shadowSoftness, true);
	view.setFloat32(44, o.shadowSteps, true);
}

export function defaultMaterialOverrides(): MaterialOverrides {
	return { ...DEFAULT_MATERIAL_OVERRIDES };
}
