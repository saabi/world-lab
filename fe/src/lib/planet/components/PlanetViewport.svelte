<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { CameraState } from '../camera/cameraModes.js';
	import { blendPatchModes, selectRenderMode } from '../camera/cameraModes.js';
	import { createOrbitCamera, quatFromAzimuthElevation } from '../camera/orbitCamera.js';
	import type { Quat } from '../scene/types.js';
	import { quatFromAxisAngle, quatMultiply, rotateVec3 } from '../scene/transform.js';
	import { len3 } from '../math/vec.js';
	import {
		altitudeToDistance,
		distanceToAltitude,
		nudgeAltitudeASL
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
		requestRender();
	});

	$effect(() => {
		if (!dragging) {
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

	function onPointerDown(e: PointerEvent) {
		dragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const dx = e.clientX - lastX;
		const dy = e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;

		const sensitivity = 0.005;
		// 1. Yaw: rotate around world Up [0, 1, 0]
		const qYaw = quatFromAxisAngle([0, 1, 0], dx * sensitivity);
		let nextRot = quatMultiply(qYaw, cameraRotation);

		// 2. Pitch: rotate around local Right axis
		const localRight = rotateVec3(nextRot, [0, 0, -1]);
		const qPitch = quatFromAxisAngle(localRight, -dy * sensitivity);
		nextRot = quatMultiply(qPitch, nextRot);

		// 3. Decompose back to azimuth/elevation so the UI sliders update:
		const pos = rotateVec3(nextRot, [cameraDistance, 0, 0]);
		const dist = len3(pos);
		elevation = Math.max(-1.55, Math.min(1.55, Math.asin(pos[1] / (dist || 1))));
		azimuth = Math.atan2(pos[2], pos[0]);

		// 4. Update the camera rotation quaternion to match the clamped values
		cameraRotation = quatFromAzimuthElevation(azimuth, elevation);
	}

	function onPointerUp(e: PointerEvent) {
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		altitudeMeters = nudgeAltitudeASL(params, altitudeMeters, e.deltaY, atmosphere);
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

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		const resized =
			width > 0 && height > 0 && (width !== canvasWidth || height !== canvasHeight);
		const animating = orbitSpeedRadPerSec !== 0 || spinSpeedRadPerSec !== 0;

		if ((needsRender || resized || animating) && width > 0 && height > 0) {
			if (resized) {
				canvas.width = width;
				canvas.height = height;
				backend.resize(width, height);
				canvasWidth = width;
				canvasHeight = height;
			}
			const camera = buildCamera(width, height, params);
			const frame = buildFrame(time * 0.001, camera, width, height, params);
			stats = backend.render(frame);
			hud = {
				altitude: altitudeMeters,
				sphereAltitude: camera.altitudeMeters,
				mode: modeState,
				rebases: localFrame.rebaseCount,
				fps: hud.fps
			};
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

		return () => {
			resizeObserver.disconnect();
			cancelAnimationFrame(raf);
			rafActive = false;
			backend?.destroy();
			backend = null;
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
</style>
