<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
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
		type TessellationSettings
	} from '../patches/tessellationSettings.js';
	import type { CubeSpherePatch } from '../patches/types.js';
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
	let predictionHorizonSeconds = $state(600);
	let predictionAutoPeriod = $state(true);

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

		let cubeSpherePatches: CubeSpherePatch[] = [];
		let orbitSchedule: OrbitScheduleMeta | undefined;

		if (modes.cubeSphere) {
			const scheduled = scheduleOrbitPatches(activeCamera.position, p.radius, activeCamera.viewProjectionMatrix, {
				viewport: { width, height },
				focalLengthPx: camera.focalLengthPx,
				detail: tessellation.detail,
				maxVertices: tessellation.vertexBudgetMillions * 1_000_000
			});
			cubeSpherePatches = scheduled.patches;
			orbitSchedule = {
				buckets: scheduled.buckets,
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
			cubeSpherePatches,
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

		const R = seaLevelRadius(params);
		const mu = spaceflightGravity * R * R;
		const dist = len3(freeFlyPosition);

		// Calculate lookahead time T
		let T = predictionHorizonSeconds;
		if (predictionAutoPeriod) {
			const period = 2 * Math.PI * Math.sqrt(Math.pow(dist, 3) / (mu || 1));
			T = Math.min(3600, period); // cap at 1 hour
		}

		// Numerical integration
		const N = 250;
		const dt = T / N;
		let p = [...freeFlyPosition] as Vec3;
		let v = [...spaceflightVelocity] as Vec3;

		const pathPoints: Vec3[] = [[...p]];
		let crashed = false;

		for (let i = 0; i < N; i++) {
			const d = len3(p);
			if (d < params.radius + 1.0) {
				crashed = true;
				break;
			}
			const gAccMagnitude = mu / (d * d * d || 1);
			const ax = -p[0] * gAccMagnitude;
			const ay = -p[1] * gAccMagnitude;
			const az = -p[2] * gAccMagnitude;

			v = [v[0] + ax * dt, v[1] + ay * dt, v[2] + az * dt];
			p = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
			pathPoints.push([...p]);
		}

		// Detect landmarks (Ap/Pe)
		let pePoint: Vec3 | null = null;
		let apPoint: Vec3 | null = null;

		for (let i = 1; i < pathPoints.length - 1; i++) {
			const dPrev = len3(pathPoints[i - 1]);
			const dCurr = len3(pathPoints[i]);
			const dNext = len3(pathPoints[i + 1]);

			if (dCurr < dPrev && dCurr < dNext) {
				if (dCurr > params.radius + 1.05) {
					pePoint = pathPoints[i];
				}
			}
			if (dCurr > dPrev && dCurr > dNext) {
				apPoint = pathPoints[i];
			}
		}

		// Project points to screen coordinates and compute occlusion
		const projectedPoints: ({ sx: number; sy: number; occluded: boolean } | null)[] = [];
		const M = camera.viewProjectionMatrix;
		const camPos = camera.position;

		for (const pt of pathPoints) {
			const proj = project3DTo2D(pt, M, width, height);
			if (!proj) {
				projectedPoints.push(null);
				continue;
			}

			// Occlusion check
			const rx = pt[0] - camPos[0];
			const ry = pt[1] - camPos[1];
			const rz = pt[2] - camPos[2];

			const A = rx * rx + ry * ry + rz * rz;
			const B = 2 * (camPos[0] * rx + camPos[1] * ry + camPos[2] * rz);
			const C_coeff =
				camPos[0] * camPos[0] +
				camPos[1] * camPos[1] +
				camPos[2] * camPos[2] -
				params.radius * params.radius;

			const disc = B * B - 4 * A * C_coeff;
			let occluded = false;
			if (disc >= 0) {
				const t1 = (-B - Math.sqrt(disc)) / (2 * A);
				if (t1 > 0 && t1 < 1.0) {
					occluded = true;
				}
			}

			projectedPoints.push({ sx: proj.x, sy: proj.y, occluded });
		}

		// Draw the line segments
		ctx.lineWidth = 2.5;
		ctx.shadowBlur = 4;
		ctx.shadowColor = '#00f0ff';

		for (let i = 1; i < projectedPoints.length; i++) {
			const p0 = projectedPoints[i - 1];
			const p1 = projectedPoints[i];
			if (!p0 || !p1) continue;

			ctx.beginPath();
			ctx.moveTo(p0.sx, p0.sy);
			ctx.lineTo(p1.sx, p1.sy);

			if (p1.occluded) {
				ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
				ctx.setLineDash([4, 4]);
			} else {
				ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
				ctx.setLineDash([]);
			}
			ctx.stroke();
		}

		ctx.setLineDash([]);
		ctx.shadowBlur = 0;

		// Draw landmarks
		ctx.font = 'bold 11px Courier New, Courier, monospace';
		ctx.lineWidth = 3;
		ctx.strokeStyle = '#000000';

		// Draw Pe
		if (pePoint) {
			const proj = project3DTo2D(pePoint, M, width, height);
			if (proj) {
				const peAlt = len3(pePoint) - params.radius;
				ctx.beginPath();
				ctx.arc(proj.x, proj.y, 4, 0, 2 * Math.PI);
				ctx.fillStyle = '#00ff66';
				ctx.fill();

				const text = `Pe: Alt ${peAlt.toFixed(0)} m`;
				ctx.strokeText(text, proj.x + 8, proj.y + 4);
				ctx.fillText(text, proj.x + 8, proj.y + 4);
			}
		}

		// Draw Ap
		if (apPoint) {
			const proj = project3DTo2D(apPoint, M, width, height);
			if (proj) {
				const apAlt = len3(apPoint) - params.radius;
				ctx.beginPath();
				ctx.arc(proj.x, proj.y, 4, 0, 2 * Math.PI);
				ctx.fillStyle = '#ff3366';
				ctx.fill();

				const text = `Ap: Alt ${apAlt.toFixed(0)} m`;
				ctx.strokeText(text, proj.x + 8, proj.y + 4);
				ctx.fillText(text, proj.x + 8, proj.y + 4);
			}
		}

		// Draw Impact Site
		if (crashed) {
			const crashPt = pathPoints[pathPoints.length - 1];
			const proj = project3DTo2D(crashPt, M, width, height);
			if (proj) {
				ctx.strokeStyle = '#ff3333';
				ctx.lineWidth = 2.5;

				// Draw X
				ctx.beginPath();
				ctx.moveTo(proj.x - 5, proj.y - 5);
				ctx.lineTo(proj.x + 5, proj.y + 5);
				ctx.moveTo(proj.x + 5, proj.y - 5);
				ctx.lineTo(proj.x - 5, proj.y + 5);
				ctx.stroke();

				ctx.fillStyle = '#ff3333';
				const text = 'IMPACT SITE';
				ctx.strokeText(text, proj.x + 8, proj.y + 4);
				ctx.fillText(text, proj.x + 8, proj.y + 4);
			}
		}
	}

	function clearOverlayCanvas() {
		if (!overlayCanvas) return;
		const ctx = overlayCanvas.getContext('2d');
		if (ctx) {
			ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
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

			let nextRot = quatMultiply(freeFlyRotation, qYaw);
			nextRot = quatMultiply(nextRot, qPitch);
			freeFlyRotation = nextRot;

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
			const thrusterPower = Math.max(5.0, altitude * 0.15);
			const forward = rotateVec3(freeFlyRotation, [0, 0, -1]);
			const right = rotateVec3(freeFlyRotation, [1, 0, 0]);
			const up = rotateVec3(freeFlyRotation, [0, 1, 0]);

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
				freeFlyRotation = quatMultiply(freeFlyRotation, qRoll);
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

		hydrateFromSession();
		hydrated = true;

		void (async () => {
			try {
				if (navigator.gpu) {
					const webgpu = new WebGPUBackend();
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
			if (backend) {
				requestRender();
			}
		})();

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
			backend?.destroy();
			backend = null;

			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			document.removeEventListener('pointerlockchange', handlePointerLockChange);
			window.removeEventListener('blur', handleBlur);
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

	{#if spaceflightActive}
		<div class="spaceflight-hud" onpointerdown={stopPointerPropagation}>
			<div class="hud-header">ORBITAL FLIGHT HUD</div>
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
						<span class="hud-label">Lookahead: {predictionHorizonSeconds}s</span>
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
		width: 480px;
		max-width: 90%;
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

	.overlay-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 5;
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
</style>
