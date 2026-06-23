import { describe, expect, it } from 'vitest';
import { applyBodyDesign, applySnapshot, toBodySnapshot, toSnapshot } from './snapshot.js';
import { PLANET_PRESETS } from '../params/presets.js';
import { defaultAtmosphereParams } from '../params/atmosphereParams.js';

const input = {
	presetName: 'desert' as const,
	params: { ...PLANET_PRESETS.desert },
	atmosphere: defaultAtmosphereParams(PLANET_PRESETS.desert.radius),
	camera: {
		azimuth: 1.23,
		elevation: 0.45,
		distance: 999,
		altitudeMeters: 700,
		orbitSpeedRadPerSec: 0.1,
		lookAtHorizon: false
	}
};

describe('body vs viewport in snapshots', () => {
	it('toSnapshot keeps the live camera (session restore)', () => {
		expect(toSnapshot(input).camera).toEqual(input.camera);
	});

	it('toBodySnapshot stores body design with a neutral camera, not the viewport', () => {
		const snap = toBodySnapshot({
			presetName: input.presetName,
			params: input.params,
			atmosphere: input.atmosphere
		});
		expect(snap.params).toEqual(input.params);
		expect(snap.atmosphere).toEqual(input.atmosphere);
		// camera is present (type requires it) but is the neutral default, not the input.
		expect(snap.camera.azimuth).not.toBe(input.camera.azimuth);
		expect(snap.camera.lookAtHorizon).toBe(true);
		expect(snap.camera.orbitSpeedRadPerSec).toBe(0);
	});

	it('applyBodyDesign restores design only — never camera', () => {
		const applied = applyBodyDesign(toSnapshot(input));
		expect(applied.presetName).toBe('desert');
		expect(applied.params).toEqual(input.params);
		expect(applied.atmosphere).toEqual(input.atmosphere);
		expect(applied).not.toHaveProperty('camera');
	});

	it('applySnapshot still carries camera for session restore', () => {
		expect(applySnapshot(toSnapshot(input)).camera).toEqual(input.camera);
	});
});
