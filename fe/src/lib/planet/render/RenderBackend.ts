import type { PlanetParameters } from '../params/planetParams.js';
import type { CameraState } from '../camera/cameraModes.js';
import type { LocalFrame } from '../math/localFrame.js';
import type { PackedBucket, SurfacePatch } from '../patches/types.js';
import type { LightingUniforms } from './uniformLayouts.js';
import type { MaterialOverrides } from '../material/biomes.js';
import type { AtmosphereParameters } from '../params/atmosphereParams.js';
import type { Quat } from '../scene/types.js';

export interface OrbitScheduleMeta {
	/**
	 * GPU-ready packed buckets (32-byte records, upload layout). terrainPass uploads
	 * these directly — no CubeSpherePatch objects, no re-encode. Aliases a reused
	 * per-schedule pool on the WASM path — consume the same frame. See
	 * _docs/specs/flat-patch-upload.md.
	 */
	packedBuckets: PackedBucket[];
	/** Survivor patch count (replaces the retired RenderFrame.cubeSpherePatches.length). */
	patchCount: number;
	candidatePatches: number;
	budgetDropped: number;
	vertexBudget: number;
}

export interface RenderFrame {
	time: number;
	viewportWidthPx: number;
	viewportHeightPx: number;
	camera: CameraState;
	params: PlanetParameters;
	localFrame: LocalFrame;
	surfacePatches: SurfacePatch[];
	orbitSchedule?: OrbitScheduleMeta;
	debug: {
		wireframe: boolean;
		faceColors: boolean;
		showPatchBorders: boolean;
		showRingColors: boolean;
	};
	lighting: LightingUniforms;
	materialOverrides: MaterialOverrides;
	atmosphere: AtmosphereParameters;
	/** Planet rotation quaternion: [qx, qy, qz, qw]. Rotates terrain; sun/camera stay fixed. */
	planetRotation: Quat;
}

export interface RenderStats {
	frameMs: number;
	patchCount: number;
	vertexCount: number;
	mode: string;
	candidatePatches?: number;
	visiblePatches?: number;
	budgetDropped?: number;
	vertexBudget?: number;
}

export interface PickingResult {
	hit: boolean;
	unitDir?: [number, number, number];
	distanceMeters?: number;
}

export interface RenderBackend {
	readonly kind: 'webgpu' | 'webgl';
	init(canvas: HTMLCanvasElement): Promise<void>;
	resize(width: number, height: number): void;
	render(frame: RenderFrame): RenderStats;
	destroy(): void;
	/** Deferred — stub only */
	renderPickingPass?(_frame: RenderFrame, _screenX: number, _screenY: number): PickingResult;
	/** Deferred — stub only */
	renderHeightfieldPass?(_frame: RenderFrame): void;
}
