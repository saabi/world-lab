import { describe, expect, it } from 'vitest';
import {
	sceneMaterialDebugMode,
	sceneWaterDebugToGpu,
	waterDebugDepthTest,
	waterDebugOnBlack,
	waterDebugUnlit
} from './sceneDebug.js';

describe('sceneDebug water helpers', () => {
	it('identifies water-only debug modes', () => {
		expect(waterDebugOnBlack('waterOnBlack')).toBe(true);
		expect(waterDebugOnBlack('waterUnlit')).toBe(false);
		expect(waterDebugUnlit('waterUnlit')).toBe(true);
		expect(waterDebugDepthTest('waterDepthTest')).toBe(true);
		expect(waterDebugDepthTest('waterFoam')).toBe(false);
	});

	it('routes water-only debug modes away from terrain material debug', () => {
		expect(sceneMaterialDebugMode('waterOnBlack')).toBe('off');
		expect(sceneMaterialDebugMode('waterUnlit')).toBe('off');
		expect(sceneMaterialDebugMode('waterDepthTest')).toBe('off');
		expect(sceneMaterialDebugMode('waterFoam')).toBe('off');
		expect(sceneMaterialDebugMode('belowSeaLevel')).toBe('belowSeaLevel');
	});

	it('encodes water shader debug values', () => {
		expect(sceneWaterDebugToGpu('off')).toBe(0);
		expect(sceneWaterDebugToGpu('waterOnBlack')).toBe(1);
		expect(sceneWaterDebugToGpu('waterUnlit')).toBe(1);
		expect(sceneWaterDebugToGpu('waterThickness')).toBe(3);
		expect(sceneWaterDebugToGpu('waterShore')).toBe(4);
		expect(sceneWaterDebugToGpu('waterWaveNormal')).toBe(5);
		expect(sceneWaterDebugToGpu('waterFoam')).toBe(6);
	});
});
