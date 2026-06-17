import type { PlanetParameters } from '../params/planetParams.js';
import type { CameraState } from '../camera/cameraModes.js';
import type { LocalFrame } from '../math/localFrame.js';
import type { CubeSpherePatch, SurfacePatch } from '../patches/types.js';
import type { LightingUniforms } from './uniformLayouts.js';

export interface OrbitScheduleMeta {
	buckets: Map<number, CubeSpherePatch[]>;
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
	cubeSpherePatches: CubeSpherePatch[];
	surfacePatches: SurfacePatch[];
	orbitSchedule?: OrbitScheduleMeta;
	debug: {
		wireframe: boolean;
		faceColors: boolean;
		showPatchBorders: boolean;
		showRingColors: boolean;
	};
	lighting: LightingUniforms;
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
