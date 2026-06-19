<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import OrbitPredictorWorker from '../workers/orbitPredictor.ts?worker';
	import type { CameraState } from '../camera/cameraModes.js';
	import { blendPatchModes, selectRenderMode } from '../camera/cameraModes.js';
	import { createOrbitCamera, quatFromAzimuthElevation, lookAt, perspective, multiply4 } from '../camera/orbitCamera.js';
	import type { Quat } from '../scene/types.js';
	import { quatFromAxisAngle, quatMultiply, rotateVec3, quatFromRotationMatrix } from '../scene/transform.js';
	import { len3, normalize3, cross3, add3, dot3, sub3, scale3, type Vec3 } from '../math/vec.js';
	import { geodeticToEcef } from '../math/geodetic.js';
	import {
		altitudeToDistance,
		distanceToAltitude,
		nudgeAltitudeASL,
		seaLevelRadius
	} from '../camera/seaLevel.js';
	import {
		buildLocalFrame,
		maybeRebaseFrame
	} from '../math/localFrame.js';
	import type { PlanetParameters } from '../params/planetParams.js';
	import { DEFAULT_PRESET, PLANET_PRESETS, type PlanetPresetName } from '../params/presets.js';
	import { scheduleOrbitPatches } from '../patches/cubeSphere.js';
	import {
		DEFAULT_TESSELLATION,
		MOBILE_TESSELLATION,
		type TessellationSettings
	} from '../patches/tessellationSettings.js';
	import { initialTessellationSettings } from '../patches/deviceProfile.js';
	import {
		armDeviceTessellation,
		commitDeviceTessellation,
		loadDeviceTessellation
	} from '../patches/deviceTessellation.js';
	import { buildSurfacePatchRings } from '../patches/surfaceScheduler.js';
	import type { OrbitScheduleMeta, RenderBackend, RenderFrame, RenderStats } from '../render/RenderBackend.js';
	import { WebGLBackend } from '../render/WebGLBackend.js';
	import { WebGPUBackend } from '../render/WebGPUBackend.js';
	import PlanetEditorPanel from './PlanetEditorPanel.svelte';
	import SceneTreePanel from './SceneTreePanel.svelte';
	import {
		builtinSelection,
		defaultSelection,
		documentSelection,
		parseSelection,
		selectionLabel
	} from '../documents/selection.js';
	import { applySnapshot, toSnapshot } from '../documents/snapshot.js';
	import {
		deleteDocument,
		getDocument,
		listDocuments,
		readSession,
		upsertDocument,
		writeSession
	} from '../documents/storage.js';
	import { CURRENT_SNAPSHOT_VERSION, type StoredPlanetDocument } from '../documents/types.js';
	import { createDefaultPlanetScene } from '../scene/defaults.js';
	import { collectSceneLighting } from '../scene/collectLights.js';
	import { packSceneLighting } from '../scene/packLighting.js';
	import { DEFAULT_MATERIAL_OVERRIDES, type MaterialOverrides } from '../material/biomes.js';
	import {
		defaultAtmosphereParams,
		type AtmosphereParameters
	} from '../params/atmosphereParams.js';

	let canvas = $state<HTMLCanvasElement | null>(null);
	let backend = $state<RenderBackend | null>(null);
	let backendLabel = $state('initializing…');
	let initError = $state<string | null>(null);

	let presetName = $state<PlanetPresetName>(DEFAULT_PRESET);
	let params = $state<PlanetParameters>({ ...PLANET_PRESETS[DEFAULT_PRESET] });
	let selection = $state(defaultSelection());
	let activeDocumentId = $state<string | null>(null);
	let savedDocuments = $state<StoredPlanetDocument[]>([]);
	let hydrated = $state(false);

	let scene = $state(createDefaultPlanetScene());

	let wireframe = $state(false);
	let faceColors = $state(false);
	let showPatchBorders = $state(false);
	let showRingColors = $state(false);

	let materialOverrides = $state<MaterialOverrides>({ ...DEFAULT_MATERIAL_OVERRIDES });
	let tessellation = $state<TessellationSettings>({ ...DEFAULT_TESSELLATION });
	// Boot sentinel for the persisted device tessellation: arm "attempting" before
	// the first heavy render, commit once it survives a grace period. See
	// _docs/specs/device-tessellation-defaults.md.
	const TESSELLATION_COMMIT_GRACE_MS = 2500;
	let tessellationArmedKey: string | null = null;
	let tessellationCommitted = false;
	let tessellationCommitTimer: number | null = null;
	let tessellationReducedAfterCrash = $state(false);
	// GPU device-loss recovery (re-init bounded so a broken GPU can't loop forever).
	const MAX_DEVICE_RECOVERY = 2;
	let recoveringDevice = false;
	let deviceRecoveryAttempts = 0;
	let atmosphere = $state<AtmosphereParameters>(
		defaultAtmosphereParams(PLANET_PRESETS[DEFAULT_PRESET].radius)
	);

	let azimuth = $state(0.6);
	let elevation = $state(0.35);
	let altitudeMeters = $state(distanceToAltitude(PLANET_PRESETS[DEFAULT_PRESET], 320));
	let orbitSpeedRadPerSec = $state(0);
	let lookAtHorizon = $state(true);
	let spinAngle = $state(0);
	let spinSpeedRadPerSec = $state(0);
	let axialTilt = $state(0);
	let cameraRotation = $state<Quat>([0, 0, 0, 1]);

	let freeFlyActive = $state(false);
	let freeFlyPosition = $state<Vec3>([0, 0, 0]);
	let freeFlyRotation = $state<Quat>([0, 0, 0, 1]);

	let spaceflightActive = $state(false);
	let spaceflightVelocity = $state<Vec3>([0, 0, 0]);
	let spaceflightGravity = $state(9.8);
	let overlayCanvas = $state<HTMLCanvasElement | null>(null);
	let monitorCanvas = $state<HTMLCanvasElement | null>(null);
	let predictionHorizonSeconds = $state(600);
	let predictionAutoPeriod = $state(false);
	let topDownCanvas = $state<HTMLCanvasElement | null>(null);
	let monitorOrientationMode = $state<'ship' | 'fixed'>('fixed');
	let spaceflightOrientationMode = $state<'free' | 'prograde' | 'retrograde'>('free');
	let mouseOffsetRot = $state<Quat>([0, 0, 0, 1]);
	let spaceflightThrustMultiplier = $state(1.0);
	let hudPeAltitude = $state<number | null>(null);
	let hudApAltitude = $state<number | null>(null);

	let predictorWorker: Worker | null = null;
	let workerPathPoints = $state<Vec3[]>([]);
	let workerCrashed = $state(false);
	let workerPePoint = $state<Vec3 | null>(null);
	let workerApPoint = $state<Vec3 | null>(null);
	let predictionPending = false;
	let nextPredictionRequest: {
		pos: Vec3;
		vel: Vec3;
		mu: number;
		rad: number;
		horizon: number;
		autoPeriod: boolean;
	} | null = null;

	function sendPredictionRequest(
		pos: Vec3,
		vel: Vec3,
		mu: number,
		rad: number,
		horizon: number,
		autoPeriod: boolean
	) {
		if (!predictorWorker) return;
		if (predictionPending) {
			nextPredictionRequest = { pos: [...pos], vel: [...vel], mu, rad, horizon, autoPeriod };
			return;
		}
		predictionPending = true;
		predictorWorker.postMessage({
			freeFlyPosition: [...pos],
			spaceflightVelocity: [...vel],
			spaceflightGravity,
			seaLevelRadius: seaLevelRadius(params),
			radius: rad,
			predictionHorizonSeconds: horizon,
			predictionAutoPeriod: autoPeriod,
			requestId: Date.now()
		});
	}

	// Derived HUD statistics
	let sfOrbitalSpeed = $derived(len3(spaceflightVelocity));
	let sfRadialSpeed = $derived(
		spaceflightActive ? dot3(spaceflightVelocity, normalize3(freeFlyPosition)) : 0
	);
	let sfHorizontalSpeed = $derived(
		spaceflightActive
			? Math.sqrt(Math.max(0, sfOrbitalSpeed * sfOrbitalSpeed - sfRadialSpeed * sfRadialSpeed))
			: 0
	);
	let sfGravityAcc = $derived.by(() => {
		if (!spaceflightActive) return 0;
		const dist = len3(freeFlyPosition);
		const R = seaLevelRadius(params);
		const mu = spaceflightGravity * R * R;
		return mu / (dist * dist || 1);
	});

	const keysPressed = {
		w: false,
		a: false,
		s: false,
		d: false,
		q: false,
		e: false,
		space: false,
		control: false,
		shift: false
	};

	let planetRotation = $derived.by(() => {
		const tiltRad = (axialTilt * Math.PI) / 180;
		const tiltQuat = quatFromAxisAngle([0, 0, 1], tiltRad);
		const spinQuat = quatFromAxisAngle([0, 1, 0], spinAngle);
		return quatMultiply(tiltQuat, spinQuat);
	});

	let stats = $state<RenderStats>({ frameMs: 0, patchCount: 0, vertexCount: 0, mode: 'orbit' });
	let hud = $state({ altitude: 0, sphereAltitude: 0, mode: 'orbit', rebases: 0, fps: 0 });

	let dragging = false;
	let lastX = 0;
	let lastY = 0;
	let localFrame = buildLocalFrame([0, 0, altitudeToDistance(PLANET_PRESETS[DEFAULT_PRESET], 220)], 100);
	let modeState: CameraState['mode'] = 'orbit';
	let raf = 0;
	let rafActive = false;
	let needsRender = true;
	let lastTickTime = 0;
	let lastFpsTime = 0;
	let frames = 0;
	let canvasWidth = 0;
	let canvasHeight = 0;

	let selectionReadout = $derived(
		selectionLabel(
			selection,
			activeDocumentId ? savedDocuments.find((d) => d.id === activeDocumentId)?.name : null
		)
	);

	let sceneLighting = $derived(
		packSceneLighting(collectSceneLighting(scene, params.illumination > 0.5))
	);

	let activeLightCount = $derived(sceneLighting.lightCount);
	let ambientActive = $derived(
		sceneLighting.ambient[0] > 0 ||
			sceneLighting.ambient[1] > 0 ||
			sceneLighting.ambient[2] > 0
	);
	let cameraDistance = $derived(altitudeToDistance(params, altitudeMeters));

	function currentSnapshotInput() {
		return {
			presetName,
			params,
			atmosphere,
			camera: {
				azimuth,
				elevation,
				distance: cameraDistance,
				altitudeMeters,
				orbitSpeedRadPerSec,
				lookAtHorizon
			}
		};
	}

	function applyBuiltinPreset(name: PlanetPresetName) {
		presetName = name;
		params = { ...PLANET_PRESETS[name] };
		activeDocumentId = null;
		selection = builtinSelection(name);
	}

	function applyDocument(id: string) {
		const doc = getDocument(id);
		if (!doc) return;
		const applied = applySnapshot(doc.snapshot);
		presetName = applied.presetName;
		params = applied.params;
		atmosphere = applied.atmosphere;
		azimuth = applied.camera.azimuth;
		elevation = applied.camera.elevation;
		altitudeMeters =
			applied.camera.altitudeMeters ??
			distanceToAltitude(applied.params, applied.camera.distance);
		orbitSpeedRadPerSec = applied.camera.orbitSpeedRadPerSec ?? 0;
		lookAtHorizon = applied.camera.lookAtHorizon ?? true;
		activeDocumentId = id;
		selection = documentSelection(id);
	}

	function handleSelectionChange(next: string) {
		const parsed = parseSelection(next);
		if (!parsed) return;
		if (parsed.kind === 'builtin') {
			applyBuiltinPreset(parsed.preset);
			return;
		}
		applyDocument(parsed.id);
	}

	function refreshDocuments() {
		savedDocuments = listDocuments();
	}

	function handleSave() {
		if (!activeDocumentId) return;
		const existing = getDocument(activeDocumentId);
		if (!existing) return;
		upsertDocument({
			...existing,
			snapshot: toSnapshot(currentSnapshotInput()),
			updatedAt: Date.now()
		});
		refreshDocuments();
	}

	function handleSaveAs() {
		const name = window.prompt('Save planet as…', 'My planet');
		if (!name?.trim()) return;
		const id = crypto.randomUUID();
		const snapshot = toSnapshot(currentSnapshotInput());
		if (
			!upsertDocument({
				id,
				name: name.trim(),
				updatedAt: Date.now(),
				snapshot
			})
		) {
			return;
		}
		activeDocumentId = id;
		selection = documentSelection(id);
		refreshDocuments();
	}

	function handleDelete() {
		if (!activeDocumentId) return;
		const doc = getDocument(activeDocumentId);
		if (!doc) return;
		if (!window.confirm(`Delete saved planet "${doc.name}"?`)) return;
		deleteDocument(activeDocumentId);
		refreshDocuments();
		applyBuiltinPreset(DEFAULT_PRESET);
	}

	function hydrateFromSession() {
		refreshDocuments();
		const session = readSession();
		if (!session) {
			selection = builtinSelection(presetName);
			return;
		}
		const applied = applySnapshot(session.snapshot);
		presetName = applied.presetName;
		params = applied.params;
		atmosphere = applied.atmosphere;
		azimuth = applied.camera.azimuth;
		elevation = applied.camera.elevation;
		altitudeMeters =
			applied.camera.altitudeMeters ??
			distanceToAltitude(applied.params, applied.camera.distance);
		orbitSpeedRadPerSec = applied.camera.orbitSpeedRadPerSec ?? 0;
		lookAtHorizon = applied.camera.lookAtHorizon ?? true;

		if (session.activeDocumentId && getDocument(session.activeDocumentId)) {
			activeDocumentId = session.activeDocumentId;
			selection = documentSelection(session.activeDocumentId);
		} else {
			activeDocumentId = null;
			selection = builtinSelection(applied.presetName);
		}
	}

	$effect(() => {
		if (!hydrated || !browser) return;
		const snapshot = toSnapshot(currentSnapshotInput());
		const docId = activeDocumentId;
		const timer = window.setTimeout(() => {
			writeSession({
				schemaVersion: CURRENT_SNAPSHOT_VERSION,
				snapshot,
				activeDocumentId: docId
			});
		}, 400);
		return () => window.clearTimeout(timer);
	});

	/** Re-arm the boot sentinel whenever the device tessellation changes (user edits). */
	$effect(() => {
		if (!hydrated || !browser) return;
		armTessellation($state.snapshot(tessellation));
	});

	/** Re-render when any GPU-visible input changes (not every animation frame). */
	$effect(() => {
		if (!hydrated || !backend) return;
		void backend;
		void JSON.stringify(params);
		void JSON.stringify(atmosphere);
		void JSON.stringify(materialOverrides);
		void JSON.stringify(tessellation);
		void wireframe;
		void faceColors;
		void showPatchBorders;
		void showRingColors;
		void scene;
		void azimuth;
		void elevation;
		void altitudeMeters;
		void orbitSpeedRadPerSec;
		void lookAtHorizon;
		void spinAngle;
		void spinSpeedRadPerSec;
		void axialTilt;
		void cameraRotation;
		void freeFlyActive;
		void freeFlyPosition;
		void freeFlyRotation;
		void spaceflightActive;
		void spaceflightVelocity;
		void spaceflightGravity;
		void predictionHorizonSeconds;
		void predictionAutoPeriod;
		void monitorOrientationMode;
		void spaceflightOrientationMode;
		void spaceflightThrustMultiplier;
		requestRender();
	});

	$effect(() => {
		if (freeFlyActive) return;
		// Calculate the decomposed angles of cameraRotation
		const pos = rotateVec3(cameraRotation, [cameraDistance, 0, 0]);
		const dist = len3(pos);
		const decompEl = Math.max(-1.55, Math.min(1.55, Math.asin(pos[1] / (dist || 1))));
		const decompAz = Math.atan2(pos[2], pos[0]);

		// Check if the current azimuth/elevation differ from the decomposed values
		const diffAz = Math.abs(azimuth - decompAz);
		const diffEl = Math.abs(elevation - decompEl);

		if (diffAz > 1e-4 || diffEl > 1e-4) {
			// The change came from the sliders or external source, so update the quaternion
			cameraRotation = quatFromAzimuthElevation(azimuth, elevation);
		}
	});

	$effect(() => {
		if (!hydrated || !backend) return;
		void orbitSpeedRadPerSec;
		void spinSpeedRadPerSec;
		if (orbitSpeedRadPerSec !== 0 || spinSpeedRadPerSec !== 0) requestRender();
	});

	function requestRender() {
		needsRender = true;
		if (rafActive || !backend) return;
		rafActive = true;
		raf = requestAnimationFrame(tick);
	}

	function clearTessellationCommit() {
		if (tessellationCommitTimer !== null) {
			clearTimeout(tessellationCommitTimer);
			tessellationCommitTimer = null;
		}
	}

	/** Persist a new tessellation as "attempting" before it drives a heavy render. */
	function armTessellation(settings: TessellationSettings) {
		if (!browser) return;
		const key = JSON.stringify(settings);
		if (key === tessellationArmedKey) return; // already armed this exact value
		tessellationArmedKey = key;
		tessellationCommitted = false;
		clearTessellationCommit();
		armDeviceTessellation(settings);
	}

	/** After a frame renders, flip the armed setting to "committed" once it survives the grace window. */
	function scheduleTessellationCommit() {
		if (
			!browser ||
			tessellationCommitted ||
			tessellationCommitTimer !== null ||
			tessellationArmedKey === null
		) {
			return;
		}
		const armedKey = tessellationArmedKey;
		tessellationCommitTimer = window.setTimeout(() => {
			tessellationCommitTimer = null;
			if (armedKey !== tessellationArmedKey) return; // changed since scheduling
			commitDeviceTessellation($state.snapshot(tessellation));
			tessellationCommitted = true;
			deviceRecoveryAttempts = 0; // a committed setting means the device is healthy again
		}, TESSELLATION_COMMIT_GRACE_MS);
	}

	/** Create the render backend (WebGPU, else WebGL fallback). Reused for recovery. */
	async function initBackend() {
		if (!canvas) return;
		try {
			if (navigator.gpu) {
				const webgpu = new WebGPUBackend();
				webgpu.onDeviceLost = handleDeviceLost;
				await webgpu.init(canvas);
				backend = webgpu;
				backendLabel = 'WebGPU';
			} else {
				throw new Error('WebGPU unavailable');
			}
		} catch {
			try {
				const webgl = new WebGLBackend();
				await webgl.init(canvas);
				backend = webgl;
				backendLabel = 'WebGL fallback';
			} catch (e) {
				initError = e instanceof Error ? e.message : 'No GPU backend';
				backendLabel = 'unavailable';
			}
		}
		if (backend) requestRender();
	}

	/**
	 * GPU device lost unexpectedly (TDR / driver crash / OOM). Abandon the current
	 * setting — don't commit it — drop to the floor, and re-initialize. Bounded
	 * recovery attempts avoid an init→lose→init loop on a fundamentally broken GPU.
	 */
	function handleDeviceLost(_reason: string) {
		if (recoveringDevice) return;
		clearTessellationCommit();
		tessellationCommitted = false;
		tessellation = { ...MOBILE_TESSELLATION };
		tessellationReducedAfterCrash = true;
		armTessellation($state.snapshot(tessellation));

		try {
			backend?.destroy();
		} catch {
			// tearing down a lost device — ignore
		}
		backend = null;

		if (deviceRecoveryAttempts >= MAX_DEVICE_RECOVERY) {
			initError = 'GPU device lost repeatedly';
			backendLabel = 'unavailable';
			return;
		}
		deviceRecoveryAttempts++;
		recoveringDevice = true;
		void (async () => {
			await initBackend();
			recoveringDevice = false;
			requestRender();
		})();
	}

	function buildCamera(width: number, height: number, p: PlanetParameters): CameraState {
		const aspect = width / Math.max(height, 1);
		const dist = altitudeToDistance(p, altitudeMeters);
		const far = Math.max(p.radius * 20, dist * 4);
		return createOrbitCamera({
			distance: dist,
			azimuth,
			elevation,
			fovDeg: 60,
			aspect,
			near: 0.1,
			far,
			planetRadius: p.radius,
			lookMode: lookAtHorizon ? 'horizon' : 'planet-center',
			orbitSpeedRadPerSec,
			cameraRotation
		});
	}

	function buildFrame(
		time: number,
		camera: CameraState,
		width: number,
		height: number,
		p: PlanetParameters
	): RenderFrame {
		modeState = selectRenderMode(camera.altitudeMeters, modeState, p.radius);
		const modes = blendPatchModes(modeState);
		const activeCamera = { ...camera, mode: modeState };

		const prevOrigin = localFrame.originEcef;
		localFrame = buildLocalFrame(camera.position, p.radius);
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
			const scheduled = scheduleOrbitPatches(activeCamera.position, p.radius, activeCamera.viewProjectionMatrix, {
				viewport: { width, height },
				focalLengthPx: camera.focalLengthPx,
				detail: tessellation.detail,
				maxVertices: tessellation.vertexBudgetMillions * 1_000_000,
				maxPatchResolution: tessellation.maxPatchResolution,
				maxDepth: tessellation.maxDepth
			});
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

		return {
			time,
			viewportWidthPx: width,
			viewportHeightPx: height,
			camera: activeCamera,
			params: p,
			localFrame,
			surfacePatches,
			orbitSchedule,
			debug: { wireframe, faceColors, showPatchBorders, showRingColors },
			lighting: sceneLighting,
			materialOverrides,
			atmosphere,
			planetRotation
		};
	}

	function buildFreeFlyCamera(width: number, height: number, p: PlanetParameters): CameraState {
		const aspect = width / Math.max(height, 1);
		const dist = len3(freeFlyPosition);
		const far = Math.max(p.radius * 20, dist * 4);
		const fovDeg = 60;
		const near = 0.1;

		const forward = rotateVec3(freeFlyRotation, [0, 0, -1]);
		const up = rotateVec3(freeFlyRotation, [0, 1, 0]);
		const target = add3(freeFlyPosition, forward);

		const view = lookAt(freeFlyPosition, target, up);
		const projection = perspective(fovDeg, aspect, near, far);
		const viewProjection = multiply4(projection, view);

		const altitudeMetersVal = Math.max(dist - p.radius, 0);
		const currentAzimuth = Math.atan2(freeFlyPosition[2], freeFlyPosition[0]);
		const currentElevation = Math.asin(freeFlyPosition[1] / (dist || 1));

		const geo = { latRad: currentElevation, lonRad: currentAzimuth, altitudeMeters: altitudeMetersVal };
		const ecef = geodeticToEcef(geo);
		const focalLengthPx = (0.5 * 1080) / Math.tan((fovDeg * Math.PI) / 360);

		return {
			mode: selectRenderMode(altitudeMetersVal, modeState, p.radius),
			geodetic: geo,
			ecef,
			altitudeMeters: altitudeMetersVal,
			viewMatrix: view,
			projectionMatrix: projection,
			viewProjectionMatrix: viewProjection,
			focalLengthPx,
			position: freeFlyPosition,
			target,
			cameraRotation: freeFlyRotation
		};
	}

	function enterFreeFly() {
		if (freeFlyActive) return;

		const camera = buildCamera(canvasWidth || 800, canvasHeight || 600, params);
		freeFlyPosition = camera.position;

		const vm = camera.viewMatrix;
		const s: Vec3 = [vm[0], vm[4], vm[8]];
		const u: Vec3 = [vm[1], vm[5], vm[9]];
		const b: Vec3 = [vm[2], vm[6], vm[10]];

		freeFlyRotation = quatFromRotationMatrix(s, u, b);
		freeFlyActive = true;

		// Lock keys
		keysPressed.w = false;
		keysPressed.a = false;
		keysPressed.s = false;
		keysPressed.d = false;
		keysPressed.q = false;
		keysPressed.e = false;
		keysPressed.space = false;
		keysPressed.control = false;
		keysPressed.shift = false;

		canvas?.requestPointerLock();
	}

	function exitFreeFly() {
		if (!freeFlyActive) return;
		document.exitPointerLock();
	}

	function toggleFreeFly() {
		if (freeFlyActive) {
			exitFreeFly();
		} else {
			if (spaceflightActive) {
				spaceflightActive = false;
			}
			enterFreeFly();
		}
	}

	function enterSpaceflight() {
		if (spaceflightActive) return;

		const camera = buildCamera(canvasWidth || 800, canvasHeight || 600, params);
		freeFlyPosition = camera.position;

		const vm = camera.viewMatrix;
		const s: Vec3 = [vm[0], vm[4], vm[8]];
		const u: Vec3 = [vm[1], vm[5], vm[9]];
		const b: Vec3 = [vm[2], vm[6], vm[10]];

		freeFlyRotation = quatFromRotationMatrix(s, u, b);
		spaceflightActive = true;

		// Initialize circular orbit velocity
		const R = seaLevelRadius(params);
		const mu = spaceflightGravity * R * R;
		const pos = freeFlyPosition;
		const dist = len3(pos);
		const vc = Math.sqrt(mu / (dist || 1));

		const outward = normalize3(pos);
		const forward = rotateVec3(freeFlyRotation, [0, 0, -1]);
		let tangent = sub3(forward, scale3(outward, dot3(forward, outward)));
		let lenT = len3(tangent);
		if (lenT < 1e-4) {
			const right = rotateVec3(freeFlyRotation, [1, 0, 0]);
			tangent = sub3(right, scale3(outward, dot3(right, outward)));
			lenT = len3(tangent);
		}
		const tangentDir = scale3(tangent, 1 / (lenT || 1));
		spaceflightVelocity = scale3(tangentDir, vc);

		// Lock keys
		keysPressed.w = false;
		keysPressed.a = false;
		keysPressed.s = false;
		keysPressed.d = false;
		keysPressed.q = false;
		keysPressed.e = false;
		keysPressed.space = false;
		keysPressed.control = false;
		keysPressed.shift = false;

		canvas?.requestPointerLock();
	}

	function exitSpaceflight() {
		if (!spaceflightActive) return;
		spaceflightActive = false;
		if (document.pointerLockElement === canvas) {
			document.exitPointerLock();
		}
		// transition camera back to orbit mode
		const camera = buildFreeFlyCamera(canvasWidth || 800, canvasHeight || 600, params);
		const vm = camera.viewMatrix;
		const s: Vec3 = [vm[0], vm[4], vm[8]];
		const u: Vec3 = [vm[1], vm[5], vm[9]];
		const outward = normalize3(camera.position);

		altitudeMeters = Math.max(0, len3(freeFlyPosition) - params.radius);
		azimuth = Math.atan2(freeFlyPosition[2], freeFlyPosition[0]);
		elevation = Math.max(-1.55, Math.min(1.55, Math.asin(freeFlyPosition[1] / (len3(freeFlyPosition) || 1))));
		cameraRotation = quatFromRotationMatrix(outward, u, s);

		needsRender = true;
		requestRender();
	}

	function toggleSpaceflight() {
		if (spaceflightActive) {
			exitSpaceflight();
		} else {
			if (freeFlyActive) {
				freeFlyActive = false;
			}
			enterSpaceflight();
		}
	}

	function circularizeOrbit() {
		if (!spaceflightActive) return;
		const pos = freeFlyPosition;
		const dist = len3(pos);
		const R = seaLevelRadius(params);
		const mu = spaceflightGravity * R * R;
		const vc = Math.sqrt(mu / (dist || 1));

		const outward = normalize3(pos);
		const forward = rotateVec3(freeFlyRotation, [0, 0, -1]);
		let tangent = sub3(forward, scale3(outward, dot3(forward, outward)));
		let lenT = len3(tangent);
		if (lenT < 1e-4) {
			const right = rotateVec3(freeFlyRotation, [1, 0, 0]);
			tangent = sub3(right, scale3(outward, dot3(right, outward)));
			lenT = len3(tangent);
		}
		const tangentDir = scale3(tangent, 1 / (lenT || 1));
		spaceflightVelocity = scale3(tangentDir, vc);
		needsRender = true;
		requestRender();
	}

	function killVelocity() {
		if (!spaceflightActive) return;
		spaceflightVelocity = [0, 0, 0];
		needsRender = true;
		requestRender();
	}

	function orientTo(direction: 'prograde' | 'retrograde') {
		if (!spaceflightActive) return;
		const speed = len3(spaceflightVelocity);
		if (speed < 0.01) return; // velocity is too small to orient

		spaceflightOrientationMode = direction;
		mouseOffsetRot = [0, 0, 0, 1]; // Reset offset to look straight

		// Do an initial immediate calculation to avoid 1-frame lag
		const velDir = normalize3(spaceflightVelocity);
		const lookDir = direction === 'prograde' ? velDir : scale3(velDir, -1);
		const b_vec = scale3(lookDir, -1);

		const outward = normalize3(freeFlyPosition);
		let dotVal = dot3(outward, b_vec);
		let u_vec = sub3(outward, scale3(b_vec, dotVal));
		let lenU = len3(u_vec);

		if (lenU < 1e-4) {
			const north = [0, 1, 0] as Vec3;
			dotVal = dot3(north, b_vec);
			u_vec = sub3(north, scale3(b_vec, dotVal));
			lenU = len3(u_vec);
		}

		u_vec = scale3(u_vec, 1 / (lenU || 1));
		const s_vec = normalize3(cross3(u_vec, b_vec));

		const autoRot = quatFromRotationMatrix(s_vec, u_vec, b_vec);
		freeFlyRotation = autoRot;

		needsRender = true;
		requestRender();
	}

	function releaseOrientation() {
		spaceflightOrientationMode = 'free';
		needsRender = true;
		requestRender();
	}

	function project3DTo2D(P: Vec3, M: Float32Array, width: number, height: number) {
		const cx = M[0] * P[0] + M[4] * P[1] + M[8] * P[2] + M[12];
		const cy = M[1] * P[0] + M[5] * P[1] + M[9] * P[2] + M[13];
		const cz = M[2] * P[0] + M[6] * P[1] + M[10] * P[2] + M[14];
		const cw = M[3] * P[0] + M[7] * P[1] + M[11] * P[2] + M[15];
		if (cw <= 0) return null;
		const ndcx = cx / cw;
		const ndcy = cy / cw;
		return {
			x: ((ndcx + 1) / 2) * width,
			y: ((1 - ndcy) / 2) * height
		};
	}

	function drawOrbitalProjection(camera: CameraState) {
		if (!overlayCanvas || !spaceflightActive) return;

		const ctx = overlayCanvas.getContext('2d');
		if (!ctx) return;

		const width = overlayCanvas.clientWidth;
		const height = overlayCanvas.clientHeight;
		if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
			overlayCanvas.width = width;
			overlayCanvas.height = height;
		}

		ctx.clearRect(0, 0, width, height);

		// Send request to web worker for orbit calculation
		sendPredictionRequest(
			freeFlyPosition,
			spaceflightVelocity,
			spaceflightGravity * seaLevelRadius(params) * seaLevelRadius(params),
			params.radius,
			predictionHorizonSeconds,
			predictionAutoPeriod
		);

		// Draw prograde and retrograde indicators directly on the 3D display
		const speed = len3(spaceflightVelocity);
		if (speed > 0.05) {
			const velDir = normalize3(spaceflightVelocity);
			const M = camera.viewProjectionMatrix;
			const camPos = camera.position;

			// Prograde
			const pProj = add3(camPos, scale3(velDir, 1000.0));
			const pProjScreen = project3DTo2D(pProj, M, width, height);
			if (pProjScreen) {
				// Occlusion check
				const rx = pProj[0] - camPos[0];
				const ry = pProj[1] - camPos[1];
				const rz = pProj[2] - camPos[2];
				const A = rx * rx + ry * ry + rz * rz;
				const B = 2 * (camPos[0] * rx + camPos[1] * ry + camPos[2] * rz);
				const C_coeff = camPos[0] * camPos[0] + camPos[1] * camPos[1] + camPos[2] * camPos[2] - params.radius * params.radius;
				const disc = B * B - 4 * A * C_coeff;
				let occluded = false;
				if (disc >= 0) {
					const t1 = (-B - Math.sqrt(disc)) / (2 * A);
					if (t1 > 0 && t1 < 1.0) occluded = true;
				}
				drawMarkerSymbol(ctx, pProjScreen.x, pProjScreen.y, 'PROGRADE', occluded);
			}

			// Retrograde
			const rProj = add3(camPos, scale3(velDir, -1000.0));
			const rProjScreen = project3DTo2D(rProj, M, width, height);
			if (rProjScreen) {
				// Occlusion check
				const rx = rProj[0] - camPos[0];
				const ry = rProj[1] - camPos[1];
				const rz = rProj[2] - camPos[2];
				const A = rx * rx + ry * ry + rz * rz;
				const B = 2 * (camPos[0] * rx + camPos[1] * ry + camPos[2] * rz);
				const C_coeff = camPos[0] * camPos[0] + camPos[1] * camPos[1] + camPos[2] * camPos[2] - params.radius * params.radius;
				const disc = B * B - 4 * A * C_coeff;
				let occluded = false;
				if (disc >= 0) {
					const t1 = (-B - Math.sqrt(disc)) / (2 * A);
					if (t1 > 0 && t1 < 1.0) occluded = true;
				}
				drawMarkerSymbol(ctx, rProjScreen.x, rProjScreen.y, 'RETROGRADE', occluded);
			}
		}

		// Draw top-down monitor and overlay from worker prediction cache
		if (workerPathPoints.length > 0) {
			drawOrbitMonitor(workerPathPoints, workerCrashed, workerPePoint, workerApPoint);
			drawTopDownOverlay(workerPathPoints, workerCrashed, workerPePoint, workerApPoint);
		}
	}

	function drawMarkerSymbol(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		type: 'PROGRADE' | 'RETROGRADE',
		occluded: boolean
	) {
		ctx.save();
		if (occluded) {
			ctx.globalAlpha = 0.25;
		} else {
			ctx.globalAlpha = 0.85;
		}

		ctx.lineWidth = 2;
		ctx.shadowBlur = occluded ? 0 : 4;

		if (type === 'PROGRADE') {
			ctx.strokeStyle = '#00ff66';
			ctx.fillStyle = '#00ff66';
			ctx.shadowColor = '#00ff66';

			// Circle
			ctx.beginPath();
			ctx.arc(x, y, 8, 0, 2 * Math.PI);
			ctx.stroke();

			// Center dot
			ctx.beginPath();
			ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
			ctx.fill();

			// Ticks
			ctx.beginPath();
			ctx.moveTo(x, y - 8);
			ctx.lineTo(x, y - 13);
			ctx.moveTo(x - 8, y);
			ctx.lineTo(x - 13, y);
			ctx.moveTo(x + 8, y);
			ctx.lineTo(x + 13, y);
			ctx.stroke();

			// Text
			ctx.font = 'bold 9px Courier New, monospace';
			ctx.fillText('PRG', x + 12, y + 3);
		} else {
			ctx.strokeStyle = '#ff5555';
			ctx.fillStyle = '#ff5555';
			ctx.shadowColor = '#ff5555';

			// Circle
			ctx.beginPath();
			ctx.arc(x, y, 8, 0, 2 * Math.PI);
			ctx.stroke();

			// Inner 'X'
			ctx.beginPath();
			ctx.moveTo(x - 5, y - 5);
			ctx.lineTo(x + 5, y + 5);
			ctx.moveTo(x + 5, y - 5);
			ctx.lineTo(x - 5, y + 5);
			ctx.stroke();

			// Ticks
			ctx.beginPath();
			ctx.moveTo(x, y - 8);
			ctx.lineTo(x, y - 13);
			ctx.moveTo(x - 8, y);
			ctx.lineTo(x - 13, y);
			ctx.stroke();

			// Text
			ctx.font = 'bold 9px Courier New, monospace';
			ctx.fillText('RET', x + 12, y + 3);
		}

		ctx.restore();
	}

	function drawOrbitMonitor(
		pathPoints: Vec3[],
		crashed: boolean,
		pePoint: Vec3 | null,
		apPoint: Vec3 | null
	) {
		if (!monitorCanvas || !spaceflightActive) return;

		const ctx = monitorCanvas.getContext('2d');
		if (!ctx) return;

		const size = 180;
		if (monitorCanvas.width !== size || monitorCanvas.height !== size) {
			monitorCanvas.width = size;
			monitorCanvas.height = size;
		}

		ctx.clearRect(0, 0, size, size);

		// Background grid/radar lines
		ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(size / 2, size / 2, size / 2 - 1, 0, 2 * Math.PI);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(size / 2, size / 2, size / 4, 0, 2 * Math.PI);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(0, size / 2);
		ctx.lineTo(size, size / 2);
		ctx.moveTo(size / 2, 0);
		ctx.lineTo(size / 2, size);
		ctx.stroke();

		// Calculate orbital plane basis
		const pos = freeFlyPosition;
		const vel = spaceflightVelocity;

		const rLen = len3(pos);
		if (rLen < 1e-3) return;

		// Orbit normal = pos x vel
		let normal = cross3(pos, vel);
		let nLen = len3(normal);
		if (nLen < 1e-4) {
			const altAxis: Vec3 = Math.abs(pos[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
			normal = cross3(pos, altAxis);
			nLen = len3(normal);
		}
		const normalDir = scale3(normal, 1 / (nLen || 1));

		// Basis x = pos / |pos|
		const basisX = scale3(pos, 1 / rLen);
		// Basis y = normal x basisX
		const basisY = cross3(normalDir, basisX);

		// Find maximum distance in the path to autoscale
		let maxD = params.radius * 1.5;
		for (const pt of pathPoints) {
			const d = len3(pt);
			if (d > maxD) maxD = d;
		}

		// Scale so maxD fits in 80% of half-size
		const padding = 15;
		const drawRadius = size / 2 - padding;
		const scale = drawRadius / maxD;

		const cx = size / 2;
		const cy = size / 2;

		// 1. Draw planet
		const planetRad = params.radius * scale;
		ctx.beginPath();
		ctx.arc(cx, cy, planetRad, 0, 2 * Math.PI);
		ctx.fillStyle = 'rgba(10, 30, 60, 0.6)';
		ctx.fill();
		ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// 2. Draw projected path
		ctx.strokeStyle = '#00f0ff';
		ctx.lineWidth = 2;
		ctx.shadowBlur = 4;
		ctx.shadowColor = '#00f0ff';
		ctx.beginPath();

		for (let i = 0; i < pathPoints.length; i++) {
			const pt = pathPoints[i];
			const px = dot3(pt, basisX) * scale;
			const py = dot3(pt, basisY) * scale;

			const sx = cx + px;
			const sy = cy - py;

			if (i === 0) {
				ctx.moveTo(sx, sy);
			} else {
				ctx.lineTo(sx, sy);
			}
		}
		ctx.stroke();
		ctx.shadowBlur = 0;

		// 3. Draw spacecraft (always at current position pos, which projects to [rLen, 0])
		const scX = cx + rLen * scale;
		const scY = cy;

		ctx.fillStyle = '#ffffff';
		ctx.shadowBlur = 6;
		ctx.shadowColor = '#ffffff';
		ctx.beginPath();
		ctx.arc(scX, scY, 4, 0, 2 * Math.PI);
		ctx.fill();
		ctx.shadowBlur = 0;

		// 4. Draw Pe landmark
		if (pePoint) {
			const px = dot3(pePoint, basisX) * scale;
			const py = dot3(pePoint, basisY) * scale;
			ctx.beginPath();
			ctx.arc(cx + px, cy - py, 3.5, 0, 2 * Math.PI);
			ctx.fillStyle = '#00ff66';
			ctx.fill();
		}

		// 5. Draw Ap landmark
		if (apPoint) {
			const px = dot3(apPoint, basisX) * scale;
			const py = dot3(apPoint, basisY) * scale;
			ctx.beginPath();
			ctx.arc(cx + px, cy - py, 3.5, 0, 2 * Math.PI);
			ctx.fillStyle = '#ff3366';
			ctx.fill();
		}

		// 6. Draw Crash/Impact Site landmark
		if (crashed) {
			const crashPt = pathPoints[pathPoints.length - 1];
			const px = dot3(crashPt, basisX) * scale;
			const py = dot3(crashPt, basisY) * scale;
			ctx.strokeStyle = '#ff3333';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(cx + px - 4, cy - py - 4);
			ctx.lineTo(cx + px + 4, cy - py + 4);
			ctx.moveTo(cx + px + 4, cy - py - 4);
			ctx.lineTo(cx + px - 4, cy - py + 4);
			ctx.stroke();
		}
	}

	function drawTopDownOverlay(
		pathPoints: Vec3[],
		crashed: boolean,
		pePoint: Vec3 | null,
		apPoint: Vec3 | null
	) {
		if (!topDownCanvas || !spaceflightActive) return;

		const ctx = topDownCanvas.getContext('2d');
		if (!ctx) return;

		const size = 220;
		if (topDownCanvas.width !== size || topDownCanvas.height !== size) {
			topDownCanvas.width = size;
			topDownCanvas.height = size;
		}

		ctx.clearRect(0, 0, size, size);

		// Background grid/radar lines
		ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(size / 2, size / 2, size / 2 - 1, 0, 2 * Math.PI);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(size / 2, size / 2, size / 4, 0, 2 * Math.PI);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(0, size / 2);
		ctx.lineTo(size, size / 2);
		ctx.moveTo(size / 2, 0);
		ctx.lineTo(size / 2, size);
		ctx.stroke();

		// Calculate orbital plane basis
		const pos = freeFlyPosition;
		const vel = spaceflightVelocity;

		const rLen = len3(pos);
		if (rLen < 1e-3) return;

		// Orbit normal = pos x vel
		let normal = cross3(pos, vel);
		let nLen = len3(normal);
		if (nLen < 1e-4) {
			const altAxis: Vec3 = Math.abs(pos[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
			normal = cross3(pos, altAxis);
			nLen = len3(normal);
		}
		const normalDir = scale3(normal, 1 / (nLen || 1));

		// Define basis vectors for projection plane
		let basisX: Vec3;
		let basisY: Vec3;

		if (monitorOrientationMode === 'ship') {
			// Spacecraft is always on the right side of the monitor
			basisX = scale3(pos, 1 / rLen);
			basisY = cross3(normalDir, basisX);
		} else {
			// Fixed / North-Up mode:
			// Project North Pole [0, 1, 0] onto the orbital plane (basisY).
			const north = [0, 1, 0] as Vec3;
			const dotNorth = dot3(north, normalDir);
			if (Math.abs(dotNorth) > 0.999) {
				// Purely equatorial orbit
				basisX = [1, 0, 0] as Vec3;
				basisY = [0, 0, 1] as Vec3;
			} else {
				const projY = [
					north[0] - dotNorth * normalDir[0],
					north[1] - dotNorth * normalDir[1],
					north[2] - dotNorth * normalDir[2]
				] as Vec3;
				basisY = normalize3(projY);
				basisX = cross3(basisY, normalDir);
			}
		}

		// Find maximum distance in the path to autoscale
		let maxD = params.radius * 1.5;
		for (const pt of pathPoints) {
			const d = len3(pt);
			if (d > maxD) maxD = d;
		}

		// Scale so maxD fits in 80% of half-size
		const padding = 20;
		const drawRadius = size / 2 - padding;
		const scale = drawRadius / maxD;

		const cx = size / 2;
		const cy = size / 2;

		// 1. Draw planet
		const planetRad = params.radius * scale;
		ctx.beginPath();
		ctx.arc(cx, cy, planetRad, 0, 2 * Math.PI);
		ctx.fillStyle = 'rgba(10, 30, 60, 0.7)';
		ctx.fill();
		ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// Draw equator line on the planet in North-Up mode to give context
		if (monitorOrientationMode === 'fixed') {
			ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(cx - planetRad, cy);
			ctx.lineTo(cx + planetRad, cy);
			ctx.stroke();
		}

		// 2. Draw projected path
		ctx.strokeStyle = '#00f0ff';
		ctx.lineWidth = 2;
		ctx.shadowBlur = 4;
		ctx.shadowColor = '#00f0ff';
		ctx.beginPath();

		for (let i = 0; i < pathPoints.length; i++) {
			const pt = pathPoints[i];
			const px = dot3(pt, basisX) * scale;
			const py = dot3(pt, basisY) * scale;

			const sx = cx + px;
			const sy = cy - py;

			if (i === 0) {
				ctx.moveTo(sx, sy);
			} else {
				ctx.lineTo(sx, sy);
			}
		}
		ctx.stroke();
		ctx.shadowBlur = 0;

		// 3. Draw spacecraft at its actual position
		const scX = cx + dot3(pos, basisX) * scale;
		const scY = cy - dot3(pos, basisY) * scale;

		// Draw velocity vector arrow
		const velX = dot3(vel, basisX);
		const velY = dot3(vel, basisY);
		const velLen = Math.sqrt(velX * velX + velY * velY);
		if (velLen > 0.1) {
			const arrowLen = 20;
			const dx = (velX / velLen) * arrowLen;
			const dy = (velY / velLen) * arrowLen;
			ctx.strokeStyle = '#ffcc00';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(scX, scY);
			ctx.lineTo(scX + dx, scY - dy);
			ctx.stroke();

			// Draw arrow head
			const angle = Math.atan2(-dy, dx);
			ctx.fillStyle = '#ffcc00';
			ctx.beginPath();
			ctx.moveTo(scX + dx, scY - dy);
			ctx.lineTo(scX + dx - 5 * Math.cos(angle - Math.PI / 6), scY - dy - 5 * Math.sin(angle - Math.PI / 6));
			ctx.lineTo(scX + dx - 5 * Math.cos(angle + Math.PI / 6), scY - dy - 5 * Math.sin(angle + Math.PI / 6));
			ctx.closePath();
			ctx.fill();
		}

		ctx.fillStyle = '#ffffff';
		ctx.shadowBlur = 6;
		ctx.shadowColor = '#ffffff';
		ctx.beginPath();
		ctx.arc(scX, scY, 4.5, 0, 2 * Math.PI);
		ctx.fill();
		ctx.shadowBlur = 0;

		// 4. Draw Pe landmark
		if (pePoint) {
			const px = dot3(pePoint, basisX) * scale;
			const py = dot3(pePoint, basisY) * scale;
			ctx.beginPath();
			ctx.arc(cx + px, cy - py, 4, 0, 2 * Math.PI);
			ctx.fillStyle = '#00ff66';
			ctx.fill();

			ctx.font = 'bold 9px monospace';
			ctx.fillStyle = '#00ff66';
			ctx.fillText('Pe', cx + px + 6, cy - py + 3);
		}

		// 5. Draw Ap landmark
		if (apPoint) {
			const px = dot3(apPoint, basisX) * scale;
			const py = dot3(apPoint, basisY) * scale;
			ctx.beginPath();
			ctx.arc(cx + px, cy - py, 4, 0, 2 * Math.PI);
			ctx.fillStyle = '#ff3366';
			ctx.fill();

			ctx.font = 'bold 9px monospace';
			ctx.fillStyle = '#ff3366';
			ctx.fillText('Ap', cx + px + 6, cy - py + 3);
		}

		// 6. Draw Crash/Impact Site landmark
		if (crashed) {
			const crashPt = pathPoints[pathPoints.length - 1];
			const px = dot3(crashPt, basisX) * scale;
			const py = dot3(crashPt, basisY) * scale;
			ctx.strokeStyle = '#ff3333';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(cx + px - 5, cy - py - 5);
			ctx.lineTo(cx + px + 5, cy - py + 5);
			ctx.moveTo(cx + px + 5, cy - py - 5);
			ctx.lineTo(cx + px - 5, cy - py + 5);
			ctx.stroke();
		}
	}

	function clearOverlayCanvas() {
		hudPeAltitude = null;
		hudApAltitude = null;
		workerPathPoints = [];
		workerCrashed = false;
		workerPePoint = null;
		workerApPoint = null;
		nextPredictionRequest = null;
		if (overlayCanvas) {
			const ctx = overlayCanvas.getContext('2d');
			if (ctx) ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
		}
		if (monitorCanvas) {
			const ctx = monitorCanvas.getContext('2d');
			if (ctx) ctx.clearRect(0, 0, monitorCanvas.width, monitorCanvas.height);
		}
		if (topDownCanvas) {
			const ctx = topDownCanvas.getContext('2d');
			if (ctx) ctx.clearRect(0, 0, topDownCanvas.width, topDownCanvas.height);
		}
	}

	function handlePointerLockChange() {
		if (document.pointerLockElement !== canvas) {
			if (spaceflightActive) {
				// We do NOT exit spaceflight mode when pointer lock is lost.
				// This allows the user to click HUD overlay buttons.
				needsRender = true;
				requestRender();
			} else if (freeFlyActive) {
				const camera = buildFreeFlyCamera(canvasWidth || 800, canvasHeight || 600, params);
				const vm = camera.viewMatrix;
				const s: Vec3 = [vm[0], vm[4], vm[8]];
				const u: Vec3 = [vm[1], vm[5], vm[9]];
				const outward = normalize3(camera.position);

				altitudeMeters = Math.max(0, len3(freeFlyPosition) - params.radius);
				azimuth = Math.atan2(freeFlyPosition[2], freeFlyPosition[0]);
				elevation = Math.max(-1.55, Math.min(1.55, Math.asin(freeFlyPosition[1] / (len3(freeFlyPosition) || 1))));
				cameraRotation = quatFromRotationMatrix(outward, u, s);

				freeFlyActive = false;
				needsRender = true;
				requestRender();
			}
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!freeFlyActive && !spaceflightActive) return;
		const key = e.key.toLowerCase();

		if (e.key === 'Escape') {
			if (spaceflightActive) {
				if (document.pointerLockElement === canvas) {
					document.exitPointerLock();
				} else {
					exitSpaceflight();
				}
			} else {
				exitFreeFly();
			}
			return;
		}

		if (spaceflightActive && (key === ' ' || e.code === 'Space' || key === 'control')) {
			e.preventDefault();
		}

		let changed = false;
		if (key === 'w' && !keysPressed.w) { keysPressed.w = true; changed = true; }
		if (key === 'a' && !keysPressed.a) { keysPressed.a = true; changed = true; }
		if (key === 's' && !keysPressed.s) { keysPressed.s = true; changed = true; }
		if (key === 'd' && !keysPressed.d) { keysPressed.d = true; changed = true; }
		if (key === 'q' && !keysPressed.q) { keysPressed.q = true; changed = true; }
		if (key === 'e' && !keysPressed.e) { keysPressed.e = true; changed = true; }
		if ((key === ' ' || e.code === 'Space') && !keysPressed.space) { keysPressed.space = true; changed = true; }
		if (key === 'control' && !keysPressed.control) { keysPressed.control = true; changed = true; }
		if (e.shiftKey) keysPressed.shift = true;

		if (changed) {
			requestRender();
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		const key = e.key.toLowerCase();
		if (key === 'w') keysPressed.w = false;
		if (key === 'a') keysPressed.a = false;
		if (key === 's') keysPressed.s = false;
		if (key === 'd') keysPressed.d = false;
		if (key === 'q') keysPressed.q = false;
		if (key === 'e') keysPressed.e = false;
		if (key === ' ' || e.code === 'Space') keysPressed.space = false;
		if (key === 'control') keysPressed.control = false;
		if (!e.shiftKey) keysPressed.shift = false;
	}

	function stopPointerPropagation(e: PointerEvent) {
		e.stopPropagation();
	}

	function onPointerDown(e: PointerEvent) {
		if (spaceflightActive) {
			if (document.pointerLockElement !== canvas) {
				canvas?.requestPointerLock();
			}
			return;
		}
		if (freeFlyActive) return;
		dragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (freeFlyActive || spaceflightActive) {
			if (document.pointerLockElement !== canvas) return;
			const dx = e.movementX;
			const dy = e.movementY;
			const sensitivity = 0.0025;

			const qYaw = quatFromAxisAngle([0, 1, 0], -dx * sensitivity);
			const qPitch = quatFromAxisAngle([1, 0, 0], -dy * sensitivity);

			if (spaceflightActive && spaceflightOrientationMode !== 'free') {
				let nextOffset = quatMultiply(mouseOffsetRot, qYaw);
				nextOffset = quatMultiply(nextOffset, qPitch);
				mouseOffsetRot = nextOffset;
			} else {
				let nextRot = quatMultiply(freeFlyRotation, qYaw);
				nextRot = quatMultiply(nextRot, qPitch);
				freeFlyRotation = nextRot;
			}

			needsRender = true;
			requestRender();
			return;
		}

		if (!dragging) return;
		const dx = e.clientX - lastX;
		const dy = e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;

		const sensitivity = 0.005;

		// Build camera state for the current view and position
		const camera = buildCamera(canvasWidth || 800, canvasHeight || 600, params);
		const vm = camera.viewMatrix;
		const s: Vec3 = [vm[0], vm[4], vm[8]]; // world-space Right vector
		const outward = normalize3(camera.position);

		// Compute world-space rotation axes aligned with the screen
		const axisYaw = normalize3(cross3(outward, s));
		const axisPitch = s;

		// Create world-space rotations
		const qYaw = quatFromAxisAngle(axisYaw, -dx * sensitivity);
		const qPitch = quatFromAxisAngle(axisPitch, -dy * sensitivity);

		// Pre-multiply to apply rotations in world space
		let nextRot = quatMultiply(qYaw, cameraRotation);
		nextRot = quatMultiply(qPitch, nextRot);

		// Update the camera rotation quaternion directly to preserve roll
		cameraRotation = nextRot;

		// Decompose back to azimuth/elevation so the UI sliders update:
		const pos = rotateVec3(nextRot, [cameraDistance, 0, 0]);
		const dist = len3(pos);
		elevation = Math.max(-1.55, Math.min(1.55, Math.asin(pos[1] / (dist || 1))));
		azimuth = Math.atan2(pos[2], pos[0]);
	}

	function onPointerUp(e: PointerEvent) {
		if (freeFlyActive || spaceflightActive) return;
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}

	function onWheel(e: WheelEvent) {
		if (freeFlyActive || spaceflightActive) return;
		e.preventDefault();
		altitudeMeters = nudgeAltitudeASL(params, altitudeMeters, e.deltaY, atmosphere);
	}

	function isMoving() {
		return keysPressed.w || keysPressed.a || keysPressed.s || keysPressed.d || keysPressed.q || keysPressed.e;
	}

	function tick(time: number) {
		if (!canvas || !backend) {
			rafActive = false;
			return;
		}

		const dt = lastTickTime > 0 ? (time - lastTickTime) / 1000 : 0;
		lastTickTime = time;

		if (orbitSpeedRadPerSec !== 0 && dt > 0) {
			azimuth += orbitSpeedRadPerSec * dt;
		}
		if (spinSpeedRadPerSec !== 0 && dt > 0) {
			spinAngle += spinSpeedRadPerSec * dt;
		}

		if (freeFlyActive && dt > 0) {
			const altitude = Math.max(10, len3(freeFlyPosition) - params.radius);
			let speed = altitude * 0.5;
			if (keysPressed.shift) {
				speed *= 5;
			}

			const forward = rotateVec3(freeFlyRotation, [0, 0, -1]);
			const right = rotateVec3(freeFlyRotation, [1, 0, 0]);

			let moveDir: Vec3 = [0, 0, 0];
			if (keysPressed.w) moveDir = [moveDir[0] + forward[0], moveDir[1] + forward[1], moveDir[2] + forward[2]];
			if (keysPressed.s) moveDir = [moveDir[0] - forward[0], moveDir[1] - forward[1], moveDir[2] - forward[2]];
			if (keysPressed.d) moveDir = [moveDir[0] + right[0], moveDir[1] + right[1], moveDir[2] + right[2]];
			if (keysPressed.a) moveDir = [moveDir[0] - right[0], moveDir[1] - right[1], moveDir[2] - right[2]];

			const moveLen = len3(moveDir);
			if (moveLen > 0) {
				const dx = (moveDir[0] / moveLen) * speed * dt;
				const dy = (moveDir[1] / moveLen) * speed * dt;
				const dz = (moveDir[2] / moveLen) * speed * dt;
				freeFlyPosition = [freeFlyPosition[0] + dx, freeFlyPosition[1] + dy, freeFlyPosition[2] + dz];
				needsRender = true;
			}

			// QE roll: rotation around local Forward axis [0, 0, -1]
			let rollDir = 0;
			if (keysPressed.q) rollDir -= 1; // roll right (clockwise)
			if (keysPressed.e) rollDir += 1; // roll left (counter-clockwise)

			if (rollDir !== 0) {
				const rollSpeed = 1.0;
				const qRoll = quatFromAxisAngle([0, 0, -1], rollDir * rollSpeed * dt);
				freeFlyRotation = quatMultiply(freeFlyRotation, qRoll);
				needsRender = true;
			}
		}

		if (spaceflightActive && dt > 0) {
			// Autopilot orientation tracking
			if (spaceflightOrientationMode !== 'free') {
				const speed = len3(spaceflightVelocity);
				if (speed > 0.01) {
					const velDir = normalize3(spaceflightVelocity);
					const lookDir = spaceflightOrientationMode === 'prograde' ? velDir : scale3(velDir, -1);
					const b_vec = scale3(lookDir, -1);

					const outward = normalize3(freeFlyPosition);
					let dotVal = dot3(outward, b_vec);
					let u_vec = sub3(outward, scale3(b_vec, dotVal));
					let lenU = len3(u_vec);

					if (lenU < 1e-4) {
						const north = [0, 1, 0] as Vec3;
						dotVal = dot3(north, b_vec);
						u_vec = sub3(north, scale3(b_vec, dotVal));
						lenU = len3(u_vec);
					}

					if (lenU < 1e-4) {
						const refX = [1, 0, 0] as Vec3;
						dotVal = dot3(refX, b_vec);
						u_vec = sub3(refX, scale3(b_vec, dotVal));
						lenU = len3(u_vec);
					}

					u_vec = scale3(u_vec, 1 / (lenU || 1));
					const s_vec = normalize3(cross3(u_vec, b_vec));

					const autoRot = quatFromRotationMatrix(s_vec, u_vec, b_vec);
					freeFlyRotation = quatMultiply(autoRot, mouseOffsetRot);
				} else {
					spaceflightOrientationMode = 'free';
				}
			}

			const pos = freeFlyPosition;
			const dist = len3(pos);
			const R = seaLevelRadius(params);
			const mu = spaceflightGravity * R * R;

			// 1. Gravity acceleration
			const gAccMagnitude = mu / (dist * dist || 1);
			const outward = normalize3(pos);
			const gravityAcceleration = scale3(outward, -gAccMagnitude);

			// 2. Thruster translation force
			const altitude = Math.max(1, dist - params.radius);
			const thrusterPower = Math.max(5.0, altitude * 0.15) * spaceflightThrustMultiplier;
			
			const camForward = rotateVec3(freeFlyRotation, [0, 0, -1]);
			const camRight = rotateVec3(freeFlyRotation, [1, 0, 0]);
			const camUp = rotateVec3(freeFlyRotation, [0, 1, 0]);

			let forward = camForward;
			let right = camRight;
			let up = camUp;

			if (spaceflightOrientationMode !== 'free' && len3(spaceflightVelocity) > 0.01) {
				const velDir = normalize3(spaceflightVelocity);
				const t_forward = spaceflightOrientationMode === 'prograde' ? velDir : scale3(velDir, -1);
				const b_vec = scale3(t_forward, -1);

				const outward = normalize3(freeFlyPosition);
				let dotVal = dot3(outward, b_vec);
				let u_vec = sub3(outward, scale3(b_vec, dotVal));
				let lenU = len3(u_vec);

				if (lenU < 1e-4) {
					const north = [0, 1, 0] as Vec3;
					dotVal = dot3(north, b_vec);
					u_vec = sub3(north, scale3(b_vec, dotVal));
					lenU = len3(u_vec);
				}

				if (lenU < 1e-4) {
					const refX = [1, 0, 0] as Vec3;
					dotVal = dot3(refX, b_vec);
					u_vec = sub3(refX, scale3(b_vec, dotVal));
					lenU = len3(u_vec);
				}

				u_vec = scale3(u_vec, 1 / (lenU || 1));
				const s_vec = normalize3(cross3(u_vec, b_vec));

				forward = t_forward;
				right = s_vec;
				up = u_vec;
			}

			let thrustDir: Vec3 = [0, 0, 0];
			if (keysPressed.w) thrustDir = add3(thrustDir, forward);
			if (keysPressed.s) thrustDir = sub3(thrustDir, forward);
			if (keysPressed.d) thrustDir = add3(thrustDir, right);
			if (keysPressed.a) thrustDir = sub3(thrustDir, right);
			if (keysPressed.space) thrustDir = add3(thrustDir, up);
			if (keysPressed.control) thrustDir = sub3(thrustDir, up);

			const thrustLen = len3(thrustDir);
			const thrustAcceleration = thrustLen > 0
				? scale3(thrustDir, thrusterPower / thrustLen)
				: ([0, 0, 0] as Vec3);

			// 3. Integrate velocity and position
			const totalAcc = add3(gravityAcceleration, thrustAcceleration);
			spaceflightVelocity = [
				spaceflightVelocity[0] + totalAcc[0] * dt,
				spaceflightVelocity[1] + totalAcc[1] * dt,
				spaceflightVelocity[2] + totalAcc[2] * dt
			];

			freeFlyPosition = [
				freeFlyPosition[0] + spaceflightVelocity[0] * dt,
				freeFlyPosition[1] + spaceflightVelocity[1] * dt,
				freeFlyPosition[2] + spaceflightVelocity[2] * dt
			];

			// Collision check
			const minRadius = params.radius + 1.0;
			const newDist = len3(freeFlyPosition);
			if (newDist < minRadius) {
				freeFlyPosition = scale3(normalize3(freeFlyPosition), minRadius);
				const out = normalize3(freeFlyPosition);
				const radialVelMag = dot3(spaceflightVelocity, out);
				if (radialVelMag < 0) {
					spaceflightVelocity = sub3(spaceflightVelocity, scale3(out, radialVelMag));
				}
			}

			// QE roll: rotation around local Forward axis [0, 0, -1]
			let rollDir = 0;
			if (keysPressed.q) rollDir -= 1;
			if (keysPressed.e) rollDir += 1;

			if (rollDir !== 0) {
				const rollSpeed = 1.0;
				const qRoll = quatFromAxisAngle([0, 0, -1], rollDir * rollSpeed * dt);
				if (spaceflightOrientationMode !== 'free') {
					mouseOffsetRot = quatMultiply(mouseOffsetRot, qRoll);
				} else {
					freeFlyRotation = quatMultiply(freeFlyRotation, qRoll);
				}
			}

			needsRender = true;
		}

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		const resized =
			width > 0 && height > 0 && (width !== canvasWidth || height !== canvasHeight);
		const animating =
			orbitSpeedRadPerSec !== 0 ||
			spinSpeedRadPerSec !== 0 ||
			(freeFlyActive && isMoving()) ||
			spaceflightActive;

		if ((needsRender || resized || animating) && width > 0 && height > 0) {
			if (resized) {
				canvas.width = width;
				canvas.height = height;
				backend.resize(width, height);
				canvasWidth = width;
				canvasHeight = height;
			}
			const camera = (freeFlyActive || spaceflightActive)
				? buildFreeFlyCamera(width, height, params)
				: buildCamera(width, height, params);
			const frame = buildFrame(time * 0.001, camera, width, height, params);
			stats = backend.render(frame);
			hud = {
				altitude: (freeFlyActive || spaceflightActive) ? len3(freeFlyPosition) - params.radius : altitudeMeters,
				sphereAltitude: camera.altitudeMeters,
				mode: modeState,
				rebases: localFrame.rebaseCount,
				fps: hud.fps
			};
			if (spaceflightActive) {
				drawOrbitalProjection(camera);
			} else {
				clearOverlayCanvas();
			}
			frames++;
			// The frame rendered without crashing — start the sentinel's commit grace.
			scheduleTessellationCommit();
			if (time - lastFpsTime > 500) {
				hud = { ...hud, fps: Math.round((frames * 1000) / (time - lastFpsTime)) };
				frames = 0;
				lastFpsTime = time;
			}
			needsRender = false;
		}

		if (needsRender || animating) {
			raf = requestAnimationFrame(tick);
		} else {
			rafActive = false;
			lastTickTime = 0;
			hud = { ...hud, fps: 0 };
			frames = 0;
		}
	}

	onMount(() => {
		if (!browser || !canvas) return;

		// Pick a safe per-device starting tessellation before the first frame: mobiles
		// boot at the lowest settings so a weak GPU can't crash on load. Desktop keeps
		// the full default. The boot sentinel restores a previously-committed device
		// preference, or falls back to the floor if the last session crashed mid-apply.
		// See _docs/specs/device-tessellation-defaults.md.
		const loadedTessellation = loadDeviceTessellation(initialTessellationSettings());
		tessellation = loadedTessellation.settings;
		tessellationReducedAfterCrash = loadedTessellation.fellBack;
		armTessellation(loadedTessellation.settings);

		predictorWorker = new OrbitPredictorWorker();
		predictorWorker.onmessage = (e) => {
			const { pathPoints, crashed, pePoint, apPoint } = e.data;
			workerPathPoints = pathPoints;
			workerCrashed = crashed;
			workerPePoint = pePoint;
			workerApPoint = apPoint;

			hudPeAltitude = pePoint ? len3(pePoint) - params.radius : null;
			hudApAltitude = apPoint ? len3(apPoint) - params.radius : null;

			predictionPending = false;
			needsRender = true;
			requestRender();

			// If there's a queued request, send it now
			if (nextPredictionRequest) {
				const req = nextPredictionRequest;
				nextPredictionRequest = null;
				sendPredictionRequest(req.pos, req.vel, req.mu, req.rad, req.horizon, req.autoPeriod);
			}
		};

		hydrateFromSession();
		hydrated = true;

		void initBackend();

		const resizeObserver = new ResizeObserver(() => requestRender());
		resizeObserver.observe(canvas);

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		document.addEventListener('pointerlockchange', handlePointerLockChange);

		const handleBlur = () => {
			keysPressed.w = false;
			keysPressed.a = false;
			keysPressed.s = false;
			keysPressed.d = false;
			keysPressed.q = false;
			keysPressed.e = false;
			keysPressed.space = false;
			keysPressed.control = false;
			keysPressed.shift = false;
		};
		window.addEventListener('blur', handleBlur);

		return () => {
			resizeObserver.disconnect();
			cancelAnimationFrame(raf);
			rafActive = false;
			clearTessellationCommit();
			backend?.destroy();
			backend = null;

			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			document.removeEventListener('pointerlockchange', handlePointerLockChange);
			window.removeEventListener('blur', handleBlur);

			predictorWorker?.terminate();
			predictorWorker = null;
		};
	});
</script>

<div class="viewport-shell">
	<canvas
		bind:this={canvas}
		class="planet-canvas"
		aria-label="Planet viewport"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onwheel={onWheel}
	></canvas>

	<canvas
		bind:this={overlayCanvas}
		class="overlay-canvas"
	></canvas>

	{#if tessellationReducedAfterCrash}
		<div class="crash-notice" role="status">
			<span>Reduced quality after a render problem. Adjust in Tessellation.</span>
			<button type="button" onclick={() => (tessellationReducedAfterCrash = false)}>Dismiss</button>
		</div>
	{/if}

	{#if spaceflightActive}
		<div class="spaceflight-hud" onpointerdown={stopPointerPropagation}>
			<div class="hud-header">ORBITAL FLIGHT HUD</div>
			
			<div class="hud-main-layout">
				<div class="hud-left-column">
					<div class="hud-grid">
						<div class="hud-stat">
							<span class="hud-label">Orbital Speed</span>
							<span class="hud-value">{sfOrbitalSpeed.toFixed(1)} m/s</span>
						</div>
						<div class="hud-stat">
							<span class="hud-label">Radial Speed</span>
							<span class="hud-value" class:positive={sfRadialSpeed > 0.05} class:negative={sfRadialSpeed < -0.05}>
								{sfRadialSpeed.toFixed(1)} m/s
								{#if sfRadialSpeed > 0.05}
									▲
								{:else if sfRadialSpeed < -0.05}
									▼
								{:else}
									◀▶
								{/if}
							</span>
						</div>
						<div class="hud-stat">
							<span class="hud-label">Horizontal Speed</span>
							<span class="hud-value">{sfHorizontalSpeed.toFixed(1)} m/s</span>
						</div>
						<div class="hud-stat">
							<span class="hud-label">Gravity Accel</span>
							<span class="hud-value">{sfGravityAcc.toFixed(2)} m/s²</span>
						</div>
					</div>
					
					<div class="hud-projection-controls">
						<div class="hud-control-row">
							<label class="hud-checkbox-label">
								<input type="checkbox" bind:checked={predictionAutoPeriod} />
								Auto-Period Projection
							</label>
						</div>
						{#if !predictionAutoPeriod}
							<div class="hud-control-row">
								<span class="hud-label" style="min-width: 95px;">Lookahead: {predictionHorizonSeconds}s</span>
								<input
									type="range"
									min="10"
									max="3600"
									step="10"
									class="hud-range-slider"
									bind:value={predictionHorizonSeconds}
								/>
							</div>
						{/if}
						<div class="hud-control-row">
							<span class="hud-label" style="min-width: 95px;">Thrust: {spaceflightThrustMultiplier.toFixed(1)}x</span>
							<input
								type="range"
								min="0.1"
								max="10.0"
								step="0.1"
								class="hud-range-slider"
								bind:value={spaceflightThrustMultiplier}
							/>
						</div>
					</div>
				</div>

				<div class="hud-right-column">
					<div class="hud-monitor-title">ORBIT MONITOR</div>
					<canvas bind:this={monitorCanvas} class="monitor-canvas"></canvas>
					<div class="hud-monitor-stats">
						{#if hudPeAltitude !== null}
							<div class="monitor-stat pe">Pe: {hudPeAltitude.toFixed(0)}m</div>
						{:else}
							<div class="monitor-stat pe disabled">Pe: Collision</div>
						{/if}
						{#if hudApAltitude !== null}
							<div class="monitor-stat ap">Ap: {hudApAltitude.toFixed(0)}m</div>
						{:else}
							<div class="monitor-stat ap disabled">Ap: N/A</div>
						{/if}
					</div>
				</div>
			</div>

			<div class="hud-controls-hint">
				RCS translation: W/S (Fwd/Bwd), A/D (L/R), Space/Ctrl (Up/Dn) & Q/E roll
			</div>
			<div class="hud-actions">
				<button type="button" class="hud-action-btn" onclick={circularizeOrbit}>
					Circulize
				</button>
				<button type="button" class="hud-action-btn abort-btn" onclick={killVelocity}>
					Kill Velocity
				</button>
				<button
					type="button"
					class="hud-action-btn"
					class:active={spaceflightOrientationMode === 'prograde'}
					onclick={() => orientTo('prograde')}
				>
					Prograde
				</button>
				<button
					type="button"
					class="hud-action-btn"
					class:active={spaceflightOrientationMode === 'retrograde'}
					onclick={() => orientTo('retrograde')}
				>
					Retrograde
				</button>
				{#if spaceflightOrientationMode !== 'free'}
					<button type="button" class="hud-action-btn release-btn" onclick={releaseOrientation}>
						Release
					</button>
				{/if}
			</div>
		</div>

		<!-- Floating Top-Down Orbit Monitor overlay in the corner -->
		<div class="floating-orbit-monitor" onpointerdown={stopPointerPropagation}>
			<div class="floating-monitor-header">
				<span>ORBIT PI-P</span>
				<select class="monitor-mode-select" bind:value={monitorOrientationMode}>
					<option value="fixed">North-Up</option>
					<option value="ship">Ship-Centric</option>
				</select>
			</div>
			<canvas bind:this={topDownCanvas} class="floating-monitor-canvas"></canvas>
			<div class="floating-monitor-stats">
				{#if hudPeAltitude !== null}
					<span class="stat-pe">Pe: {hudPeAltitude.toFixed(0)}m</span>
				{:else}
					<span class="stat-pe disabled">Pe: Crash</span>
				{/if}
				{#if hudApAltitude !== null}
					<span class="stat-ap">Ap: {hudApAltitude.toFixed(0)}m</span>
				{:else}
					<span class="stat-ap disabled">Ap: N/A</span>
				{/if}
			</div>
		</div>
	{/if}

	<div class="left-stack">
		<aside class="debug-panel">
			<h2>Virtual Planet</h2>
			<p class="backend">{backendLabel}</p>
			<p class="preset-readout">{selectionReadout}</p>
			{#if initError}
				<p class="error">{initError}</p>
			{/if}

			<div class="stats">
				<div>FPS: {hud.fps}</div>
				<div>Frame: {stats.frameMs.toFixed(1)} ms</div>
				<div>Mode: {hud.mode}</div>
				<div>Altitude ASL: {hud.altitude.toFixed(0)} m</div>
				<div>Sphere alt: {hud.sphereAltitude.toFixed(0)} m</div>
				<div>Patches: {stats.patchCount}{#if stats.candidatePatches != null} / {stats.candidatePatches} cand{/if}</div>
				<div>Vertices: {stats.vertexCount.toLocaleString()}{#if stats.vertexBudget != null} / {stats.vertexBudget.toLocaleString()} budget{/if}</div>
				{#if stats.budgetDropped != null && stats.budgetDropped > 0}
					<div>Budget dropped: {stats.budgetDropped}</div>
				{/if}
				<div>Rebases: {hud.rebases}</div>
			<div>Distance: {cameraDistance.toFixed(0)}</div>
			<div>Lights: {activeLightCount} · Ambient: {ambientActive ? 'on' : 'off'}</div>
			</div>
			<button
				type="button"
				class="nav-toggle-btn"
				class:active={freeFlyActive}
				onclick={toggleFreeFly}
			>
				{freeFlyActive ? 'Fly Mode: Active (Esc)' : 'Enter WASD Fly Mode'}
			</button>
			<button
				type="button"
				class="nav-toggle-btn spaceflight-btn"
				class:active={spaceflightActive}
				onclick={toggleSpaceflight}
			>
				{spaceflightActive ? 'Exit Spaceflight' : 'Enter Spaceflight'}
			</button>
			<div class="gravity-control-container">
				<div class="gravity-label-row">
					<span>Surface Gravity</span>
					<span class="gravity-val">{spaceflightGravity.toFixed(1)} m/s²</span>
				</div>
				<input
					type="range"
					min="0.0"
					max="30.0"
					step="0.5"
					class="gravity-range-slider"
					bind:value={spaceflightGravity}
				/>
			</div>
			{#if spaceflightActive}
				<div class="gravity-control-container" style="margin-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 12px;">
					<div class="gravity-label-row">
						<span>Auto-Period Projection</span>
						<input type="checkbox" bind:checked={predictionAutoPeriod} style="accent-color: #00f0ff; cursor: pointer;" />
					</div>
					{#if !predictionAutoPeriod}
						<div class="gravity-label-row" style="margin-top: 8px;">
							<span>Prediction Horizon</span>
							<span class="gravity-val">{predictionHorizonSeconds}s</span>
						</div>
						<input
							type="range"
							min="10"
							max="3600"
							step="10"
							class="gravity-range-slider"
							style="background: rgba(0, 240, 255, 0.2);"
							bind:value={predictionHorizonSeconds}
						/>
					{/if}
					<div class="gravity-label-row" style="margin-top: 8px;">
						<span>Thrust Power</span>
						<span class="gravity-val">{spaceflightThrustMultiplier.toFixed(1)}x</span>
					</div>
					<input
						type="range"
						min="0.1"
						max="10.0"
						step="0.1"
						class="gravity-range-slider"
						style="background: rgba(0, 240, 255, 0.2);"
						bind:value={spaceflightThrustMultiplier}
					/>
				</div>

				<div class="sidebar-spaceflight-actions" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px; width: 100%; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 12px;">
					<div style="display: flex; gap: 6px; width: 100%;">
						<button type="button" class="sidebar-action-btn" style="flex: 1; padding: 6px; font-size: 10px; cursor: pointer; background: rgba(0,240,255,0.1); border: 1px solid #00f0ff; color: #00f0ff; font-family: monospace; border-radius: 4px; font-weight: bold;" onclick={circularizeOrbit}>
							Circulize
						</button>
						<button type="button" class="sidebar-action-btn" style="flex: 1; padding: 6px; font-size: 10px; cursor: pointer; background: rgba(255,85,85,0.1); border: 1px solid #ff5555; color: #ff5555; font-family: monospace; border-radius: 4px; font-weight: bold;" onclick={killVelocity}>
							Kill Vel
						</button>
					</div>
					<div style="display: flex; gap: 6px; width: 100%;">
						<button
							type="button"
							class="sidebar-action-btn"
							style="flex: 1; padding: 6px; font-size: 10px; cursor: pointer; background: rgba(0,240,255,0.1); border: 1px solid #00f0ff; color: #00f0ff; font-family: monospace; border-radius: 4px; font-weight: bold;"
							style:background={spaceflightOrientationMode === 'prograde' ? 'rgba(0, 255, 102, 0.2)' : ''}
							style:border-color={spaceflightOrientationMode === 'prograde' ? '#00ff66' : ''}
							style:color={spaceflightOrientationMode === 'prograde' ? '#00ff66' : ''}
							onclick={() => orientTo('prograde')}
						>
							Prograde
						</button>
						<button
							type="button"
							class="sidebar-action-btn"
							style="flex: 1; padding: 6px; font-size: 10px; cursor: pointer; background: rgba(0,240,255,0.1); border: 1px solid #00f0ff; color: #00f0ff; font-family: monospace; border-radius: 4px; font-weight: bold;"
							style:background={spaceflightOrientationMode === 'retrograde' ? 'rgba(255, 51, 102, 0.2)' : ''}
							style:border-color={spaceflightOrientationMode === 'retrograde' ? '#ff3366' : ''}
							style:color={spaceflightOrientationMode === 'retrograde' ? '#ff3366' : ''}
							onclick={() => orientTo('retrograde')}
						>
							Retrograde
						</button>
						{#if spaceflightOrientationMode !== 'free'}
							<button
								type="button"
								class="sidebar-action-btn"
								style="flex: 1; padding: 6px; font-size: 10px; cursor: pointer; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.4); color: #ffffff; font-family: monospace; border-radius: 4px; font-weight: bold;"
								onclick={releaseOrientation}
							>
								Release
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</aside>

		<SceneTreePanel bind:scene illuminationOn={params.illumination > 0.5} />
	</div>

	<PlanetEditorPanel
		bind:params
		bind:atmosphere
		bind:azimuth
		bind:elevation
		bind:altitudeMeters
		bind:orbitSpeedRadPerSec
		bind:lookAtHorizon
		bind:spinAngle
		bind:spinSpeedRadPerSec
		bind:axialTilt
		bind:wireframe
		bind:faceColors
		bind:showPatchBorders
		bind:showRingColors
		bind:materialOverrides
		bind:tessellation
		{selection}
		{savedDocuments}
		onSelectionChange={handleSelectionChange}
		onSave={handleSave}
		onSaveAs={handleSaveAs}
		onDelete={handleDelete}
	/>
</div>

<style>
	.viewport-shell {
		position: relative;
		width: 100%;
		height: 100vh;
		background: #0a0a12;
	}

	.planet-canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
		cursor: grab;
	}

	.planet-canvas:active {
		cursor: grabbing;
	}

	.left-stack {
		position: absolute;
		top: 12px;
		left: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: calc(100vh - 24px);
		z-index: 1;
		width: 220px;
	}

	.debug-panel {
		padding: 12px 14px;
		background: rgba(8, 10, 20, 0.82);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		color: #e8ecf8;
		font: 13px/1.4 system-ui, sans-serif;
		min-width: 0;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	.debug-panel h2 {
		margin: 0 0 6px;
		font-size: 15px;
		font-weight: 600;
	}

	.backend {
		margin: 0 0 4px;
		opacity: 0.75;
	}

	.preset-readout {
		margin: 0 0 10px;
		opacity: 0.85;
		font-size: 12px;
	}

	.error {
		color: #f88;
		margin: 0 0 8px;
	}

	.stats {
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		display: grid;
		gap: 2px;
		font-variant-numeric: tabular-nums;
		font-size: 12px;
	}

	.nav-toggle-btn {
		width: 100%;
		margin-top: 12px;
		padding: 8px 12px;
		background: rgba(92, 60, 0, 0.45);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		color: #f0e6d8;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease, border-color 0.15s ease;
	}

	.nav-toggle-btn:hover {
		background: rgba(120, 80, 0, 0.55);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.nav-toggle-btn.active {
		background: rgba(0, 120, 60, 0.45);
		border-color: rgba(0, 255, 128, 0.3);
		color: #e6f7ed;
	}

	.nav-toggle-btn.active:hover {
		background: rgba(0, 150, 80, 0.55);
	}

	.nav-toggle-btn.spaceflight-btn {
		background: rgba(80, 0, 150, 0.45);
		color: #f5e6ff;
		margin-top: 8px;
	}

	.nav-toggle-btn.spaceflight-btn:hover {
		background: rgba(110, 0, 200, 0.55);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.nav-toggle-btn.spaceflight-btn.active {
		background: rgba(0, 120, 150, 0.45);
		border-color: rgba(0, 240, 255, 0.3);
		color: #e6f7fc;
	}

	.nav-toggle-btn.spaceflight-btn.active:hover {
		background: rgba(0, 150, 180, 0.55);
	}

	.gravity-control-container {
		margin-top: 14px;
		padding-top: 10px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.gravity-label-row {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.7);
	}

	.gravity-val {
		color: #c084fc;
		font-weight: bold;
	}

	.gravity-range-slider {
		width: 100%;
		height: 4px;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
		outline: none;
		-webkit-appearance: none;
	}

	.gravity-range-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #a855f7;
		cursor: pointer;
		transition: background 0.15s ease, transform 0.15s ease;
	}

	.gravity-range-slider::-webkit-slider-thumb:hover {
		background: #c084fc;
		transform: scale(1.2);
	}

	.spaceflight-hud {
		position: absolute;
		top: 20px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(10, 15, 30, 0.85);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1.5px solid rgba(0, 240, 255, 0.4);
		border-radius: 12px;
		padding: 16px 24px;
		width: 680px;
		max-width: 95%;
		box-shadow: 0 8px 32px 0 rgba(0, 240, 255, 0.15), inset 0 0 12px rgba(0, 240, 255, 0.05);
		color: #00f0ff;
		font-family: 'Courier New', Courier, monospace;
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		pointer-events: auto;
	}

	.hud-header {
		font-size: 14px;
		font-weight: bold;
		letter-spacing: 2px;
		text-shadow: 0 0 8px rgba(0, 240, 255, 0.6);
		border-bottom: 1px solid rgba(0, 240, 255, 0.2);
		width: 100%;
		text-align: center;
		padding-bottom: 6px;
	}

	.hud-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		width: 100%;
	}

	.hud-stat {
		display: flex;
		flex-direction: column;
		background: rgba(0, 0, 0, 0.3);
		padding: 6px 10px;
		border-radius: 4px;
		border-left: 3px solid rgba(0, 240, 255, 0.6);
	}

	.hud-label {
		font-size: 9px;
		color: rgba(0, 240, 255, 0.6);
		text-transform: uppercase;
	}

	.hud-value {
		font-size: 15px;
		font-weight: bold;
		color: #ffffff;
		text-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
	}

	.hud-value.positive {
		color: #33ff99;
		text-shadow: 0 0 4px rgba(51, 255, 153, 0.5);
	}

	.hud-value.negative {
		color: #ff5555;
		text-shadow: 0 0 4px rgba(255, 85, 85, 0.5);
	}

	.hud-controls-hint {
		font-size: 9px;
		color: rgba(255, 255, 255, 0.6);
		text-align: center;
		line-height: 1.3;
	}

	.hud-actions {
		display: flex;
		gap: 12px;
		width: 100%;
		margin-top: 4px;
	}

	.hud-action-btn {
		flex: 1;
		background: rgba(0, 240, 255, 0.15);
		border: 1px solid #00f0ff;
		border-radius: 6px;
		color: #00f0ff;
		padding: 8px;
		font-family: 'Courier New', Courier, monospace;
		font-size: 11px;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.2s ease;
		text-shadow: 0 0 4px rgba(0, 240, 255, 0.4);
	}

	.hud-action-btn:hover {
		background: rgba(0, 240, 255, 0.35);
		box-shadow: 0 0 12px rgba(0, 240, 255, 0.4);
	}

	.hud-action-btn.abort-btn {
		background: rgba(255, 85, 85, 0.15);
		border-color: #ff5555;
		color: #ff5555;
		text-shadow: 0 0 4px rgba(255, 85, 85, 0.4);
	}

	.hud-action-btn.abort-btn:hover {
		background: rgba(255, 85, 85, 0.35);
		box-shadow: 0 0 12px rgba(255, 85, 85, 0.4);
	}

	.hud-action-btn.active {
		background: rgba(0, 240, 255, 0.45);
		box-shadow: 0 0 16px rgba(0, 240, 255, 0.7);
		color: #ffffff;
		text-shadow: 0 0 6px #00f0ff;
		border-color: #00f0ff;
	}

	.hud-action-btn.release-btn {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.4);
		color: #ffffff;
		text-shadow: none;
	}

	.hud-action-btn.release-btn:hover {
		background: rgba(255, 255, 255, 0.25);
		box-shadow: 0 0 12px rgba(255, 255, 255, 0.4);
	}

	.overlay-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 5;
	}

	.crash-notice {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px;
		background: rgba(92, 30, 0, 0.9);
		border: 1px solid rgba(255, 150, 90, 0.5);
		border-radius: 4px;
		color: #ffe6d6;
		font: 12px/1.3 system-ui, sans-serif;
	}

	.crash-notice button {
		font: 11px/1.2 system-ui, sans-serif;
		padding: 2px 8px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		background: rgba(0, 0, 0, 0.25);
		color: inherit;
		cursor: pointer;
	}

	.hud-projection-controls {
		width: 100%;
		border-top: 1px solid rgba(0, 240, 255, 0.2);
		padding-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.hud-control-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
		width: 100%;
	}

	.hud-checkbox-label {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #00f0ff;
		cursor: pointer;
		user-select: none;
	}

	.hud-checkbox-label input[type="checkbox"] {
		accent-color: #00f0ff;
		cursor: pointer;
	}

	.hud-range-slider {
		flex: 1;
		margin-left: 12px;
		height: 3px;
		background: rgba(0, 240, 255, 0.2);
		border-radius: 2px;
		outline: none;
		-webkit-appearance: none;
	}

	.hud-range-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #00f0ff;
		cursor: pointer;
		box-shadow: 0 0 6px rgba(0, 240, 255, 0.8);
	}

	.hud-main-layout {
		display: flex;
		gap: 24px;
		width: 100%;
		margin-top: 8px;
	}

	.hud-left-column {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.hud-right-column {
		width: 200px;
		display: flex;
		flex-direction: column;
		align-items: center;
		background: rgba(0, 0, 0, 0.2);
		padding: 10px;
		border-radius: 8px;
		border: 1px solid rgba(0, 240, 255, 0.15);
	}

	.hud-monitor-title {
		font-size: 10px;
		color: rgba(0, 240, 255, 0.6);
		margin-bottom: 6px;
		letter-spacing: 1px;
		font-weight: bold;
		text-align: center;
	}

	.monitor-canvas {
		width: 180px;
		height: 180px;
		background: #070b14;
		border-radius: 4px;
		border: 1px solid rgba(0, 240, 255, 0.1);
	}

	.hud-monitor-stats {
		display: flex;
		justify-content: space-between;
		width: 100%;
		margin-top: 6px;
		font-size: 9px;
		font-family: 'Courier New', Courier, monospace;
	}

	.monitor-stat.pe {
		color: #00ff66;
		font-weight: bold;
	}

	.monitor-stat.ap {
		color: #ff3366;
		font-weight: bold;
	}

	.monitor-stat.disabled {
		color: rgba(255, 255, 255, 0.3);
		font-weight: normal;
	}

	.floating-orbit-monitor {
		position: absolute;
		top: 20px;
		right: 20px;
		background: rgba(10, 15, 30, 0.85);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1.5px solid rgba(0, 240, 255, 0.4);
		border-radius: 12px;
		padding: 12px;
		box-shadow: 0 8px 32px 0 rgba(0, 240, 255, 0.15), inset 0 0 12px rgba(0, 240, 255, 0.05);
		color: #00f0ff;
		font-family: 'Courier New', Courier, monospace;
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		pointer-events: auto;
		width: 240px;
	}

	.floating-monitor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		font-size: 11px;
		font-weight: bold;
		letter-spacing: 1px;
		border-bottom: 1px solid rgba(0, 240, 255, 0.2);
		padding-bottom: 4px;
	}

	.monitor-mode-select {
		background: rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(0, 240, 255, 0.4);
		border-radius: 4px;
		color: #00f0ff;
		font-size: 10px;
		font-family: 'Courier New', Courier, monospace;
		padding: 2px 4px;
		cursor: pointer;
		outline: none;
	}

	.monitor-mode-select:hover {
		background: rgba(0, 240, 255, 0.15);
		box-shadow: 0 0 6px rgba(0, 240, 255, 0.3);
	}

	.floating-monitor-canvas {
		width: 220px;
		height: 220px;
		background: #070b14;
		border-radius: 6px;
		border: 1px solid rgba(0, 240, 255, 0.15);
	}

	.floating-monitor-stats {
		display: flex;
		justify-content: space-between;
		width: 100%;
		font-size: 10px;
		font-weight: bold;
		margin-top: 2px;
	}

	.stat-pe {
		color: #00ff66;
	}

	.stat-ap {
		color: #ff3366;
	}

	.stat-pe.disabled, .stat-ap.disabled {
		color: rgba(255, 255, 255, 0.3);
	}
</style>
