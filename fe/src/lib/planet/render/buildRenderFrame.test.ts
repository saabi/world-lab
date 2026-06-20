import { describe, expect, it } from 'vitest';
import { buildRenderFrame } from './buildRenderFrame.js';
import { createOrbitCamera } from '../camera/orbitCamera.js';
import { buildLocalFrame } from '../math/localFrame.js';
import { PLANET_PRESETS, DEFAULT_PRESET } from '../params/presets.js';
import { DEFAULT_TESSELLATION } from '../patches/tessellationSettings.js';
import { DEFAULT_MATERIAL_OVERRIDES } from '../material/biomes.js';
import type { LightingUniforms } from './uniformLayouts.js';
import type { AtmosphereParameters } from '../params/atmosphereParams.js';

// Headless assembly smoke test — guards the relocated RenderFrame pipeline (the GPU
// passes themselves still need /planet to verify). lighting/atmosphere are pass-through.
describe('buildRenderFrame', () => {
	it('assembles a frame from external params + camera, advancing mode/localFrame', () => {
		const params = PLANET_PRESETS[DEFAULT_PRESET];
		const camera = createOrbitCamera({
			distance: params.radius * 3,
			azimuth: 0.5,
			elevation: 0.3,
			fovDeg: 60,
			aspect: 1.5,
			near: 0.1,
			far: params.radius * 20,
			planetRadius: params.radius
		});
		const result = buildRenderFrame({
			time: 1,
			camera,
			width: 1200,
			height: 800,
			params,
			modeState: 'orbit',
			localFrame: buildLocalFrame(camera.position, params.radius),
			tessellation: DEFAULT_TESSELLATION,
			debug: { wireframe: false, faceColors: false, showPatchBorders: false, showRingColors: false },
			lighting: {} as LightingUniforms,
			materialOverrides: DEFAULT_MATERIAL_OVERRIDES,
			atmosphere: {} as AtmosphereParameters,
			planetRotation: [0, 0, 0, 1]
		});

		expect(result.frame.params).toBe(params);
		expect(result.frame.viewportWidthPx).toBe(1200);
		expect(result.frame.viewportHeightPx).toBe(800);
		expect(result.frame.camera.mode).toBe(result.modeState);
		expect(result.localFrame.originEcef).toHaveLength(3);
	});
});
