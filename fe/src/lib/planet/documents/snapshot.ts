import type { PlanetParameters } from '../params/planetParams.js';
import {
	defaultAtmosphereParams,
	type AtmosphereParameters
} from '../params/atmosphereParams.js';
import type { PlanetPresetName } from '../params/presets.js';
import { CURRENT_SNAPSHOT_VERSION, type AppliedPlanetState, type PlanetCameraState, type PlanetSnapshot } from './types.js';

export interface SnapshotInput {
	presetName: PlanetPresetName;
	params: PlanetParameters;
	/** Optional — defaults to radius-derived atmosphere when omitted. */
	atmosphere?: AtmosphereParameters;
	camera: PlanetCameraState;
}

export function toSnapshot(input: SnapshotInput): PlanetSnapshot {
	const atmosphere = input.atmosphere ?? defaultAtmosphereParams(input.params.radius);
	return {
		schemaVersion: CURRENT_SNAPSHOT_VERSION,
		presetName: input.presetName,
		params: { ...input.params },
		atmosphere: { ...atmosphere },
		camera: { ...input.camera }
	};
}

export function applySnapshot(snapshot: PlanetSnapshot): AppliedPlanetState {
	return {
		presetName: snapshot.presetName,
		params: { ...snapshot.params },
		atmosphere: { ...snapshot.atmosphere },
		camera: { ...snapshot.camera }
	};
}

/** A viewport-neutral camera for named body saves: camera is viewport state, not body
 *  design, so a saved planet must not pin where you were looking. */
const NEUTRAL_CAMERA: PlanetCameraState = {
	azimuth: 0.6,
	elevation: 0.35,
	distance: 320,
	altitudeMeters: 0,
	orbitSpeedRadPerSec: 0,
	lookAtHorizon: true
};

/**
 * Snapshot for a **named** save — body design only (preset/params/atmosphere); the camera
 * is neutral, not the working viewport. Session restore uses {@link toSnapshot} (with the
 * live camera). See body-vs-viewport-state.md.
 */
export function toBodySnapshot(input: Omit<SnapshotInput, 'camera'>): PlanetSnapshot {
	return toSnapshot({ ...input, camera: NEUTRAL_CAMERA });
}

/**
 * Apply only the **body design** of a snapshot — preset/params/atmosphere, never camera.
 * Loading a named planet must not move the camera (that is viewport state).
 */
export function applyBodyDesign(snapshot: PlanetSnapshot): Omit<AppliedPlanetState, 'camera'> {
	return {
		presetName: snapshot.presetName,
		params: { ...snapshot.params },
		atmosphere: { ...snapshot.atmosphere }
	};
}
