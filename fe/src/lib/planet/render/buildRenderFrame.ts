import type { CameraState } from '../camera/cameraModes.js';
import { blendPatchModes, selectRenderMode } from '../camera/cameraModes.js';
import { buildLocalFrame, maybeRebaseFrame, type LocalFrame } from '../math/localFrame.js';
import type { PlanetParameters } from '../params/planetParams.js';
import type { AtmosphereParameters } from '../params/atmosphereParams.js';
import { scheduleOrbitPatches } from '../patches/cubeSphere.js';
import type { TessellationSettings } from '../patches/tessellationSettings.js';
import { buildSurfacePatchRings } from '../patches/surfaceScheduler.js';
import type { MaterialOverrides } from '../material/biomes.js';
import type { Quat } from '../scene/types.js';
import { DEFAULT_ECLIPSE_UNIFORMS, type EclipseUniforms } from '../scene/packEclipse.js';
import type { LightingUniforms } from './uniformLayouts.js';
import type { OrbitScheduleMeta, RenderFrame } from './RenderBackend.js';

// Headless RenderFrame assembly, extracted from PlanetViewport.buildFrame so the same
// procedural pipeline can render any body (scene procedural bodies), with /planet as
// the regression guard. Pure: the per-frame mutable state (modeState, localFrame) is
// passed in and returned updated; the host assigns it back. Logic is unchanged from
// the original loop. See _docs/specs/scene-procedural-rendering.md.

export interface RenderFrameDebug {
	wireframe: boolean;
	faceColors: boolean;
	showPatchBorders: boolean;
	showRingColors: boolean;
}

export interface BuildRenderFrameInputs {
	time: number;
	camera: CameraState;
	width: number;
	height: number;
	params: PlanetParameters;
	/** Previous frame's render mode (returned, advanced). */
	modeState: CameraState['mode'];
	/** Previous frame's local frame (returned, rebuilt/rebased). */
	localFrame: LocalFrame;
	tessellation: TessellationSettings;
	debug: RenderFrameDebug;
	lighting: LightingUniforms;
	materialOverrides: MaterialOverrides;
	atmosphere: AtmosphereParameters;
	/** Per-receiver eclipse occluders (body-local). Omitted ⇒ disabled (e.g. /planet). */
	eclipse?: EclipseUniforms;
	planetRotation: Quat;
}

export interface BuildRenderFrameResult {
	frame: RenderFrame;
	modeState: CameraState['mode'];
	localFrame: LocalFrame;
}

export function buildRenderFrame(input: BuildRenderFrameInputs): BuildRenderFrameResult {
	const { time, camera, width, height, params: p, tessellation } = input;

	const modeState = selectRenderMode(camera.altitudeMeters, input.modeState, p.radius);
	const modes = blendPatchModes(modeState);
	const activeCamera = { ...camera, mode: modeState };

	const prevOrigin = input.localFrame.originEcef;
	const localFrame = buildLocalFrame(camera.position, p.radius);
	const originShift = Math.hypot(
		localFrame.originEcef[0] - prevOrigin[0],
		localFrame.originEcef[1] - prevOrigin[1],
		localFrame.originEcef[2] - prevOrigin[2]
	);
	if (originShift > 10_000) {
		localFrame.rebaseCount = maybeRebaseFrame(localFrame, camera.ecef).rebaseCount;
	}

	let orbitSchedule: OrbitScheduleMeta | undefined;
	if (modes.cubeSphere) {
		const scheduled = scheduleOrbitPatches(
			activeCamera.position,
			p.radius,
			activeCamera.viewProjectionMatrix,
			{
				viewport: { width, height },
				focalLengthPx: camera.focalLengthPx,
				detail: tessellation.detail,
				maxVertices: tessellation.vertexBudgetMillions * 1_000_000,
				maxPatchResolution: tessellation.maxPatchResolution,
				maxDepth: tessellation.maxDepth,
				planetRotation: input.planetRotation
			}
		);
		orbitSchedule = {
			packedBuckets: scheduled.packedBuckets,
			patchCount: scheduled.patchCount,
			candidatePatches: scheduled.candidatePatches,
			budgetDropped: scheduled.budgetDropped,
			vertexBudget: scheduled.vertexBudget
		};
	}

	const surfacePatches = modes.surface
		? buildSurfacePatchRings({
				cameraFootLocal: [0, 0],
				cameraAltitudeMeters: camera.altitudeMeters,
				targetVertexSpacingMeters: 0,
				focalLengthPx: camera.focalLengthPx,
				viewportHeightPx: height
			})
		: [];

	const frame: RenderFrame = {
		time,
		viewportWidthPx: width,
		viewportHeightPx: height,
		camera: activeCamera,
		params: p,
		localFrame,
		surfacePatches,
		orbitSchedule,
		debug: input.debug,
		lighting: input.lighting,
		materialOverrides: input.materialOverrides,
		atmosphere: input.atmosphere,
		eclipse: input.eclipse ?? DEFAULT_ECLIPSE_UNIFORMS,
		planetRotation: input.planetRotation
	};
	return { frame, modeState, localFrame };
}
