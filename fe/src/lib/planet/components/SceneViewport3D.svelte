<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { requestWebGPUDevice, configureWebGPUCanvas } from '../render/device.js';
	import { SceneEngine, type SceneOverlayFn } from '../scene3d/sceneEngine.js';
	import { SpherePass, type BodyInstance, type SceneLighting } from '../scene3d/spherePass.js';
	import { OrbitLinePass } from '../scene3d/orbitLinePass.js';
	import { collectOrbitPathSpecs, buildOrbitPath3D, orbitPathSegmentCount, orbitPathBoundsForNearFar } from '../scene/orbitPaths.js';
	import { resolveAtmosphereVisible, resolveOrbitPathVisible } from '../scene/renderFeatures.js';
	import {
		clampElevation,
		cameraEye,
		FOVY,
		projectToScreen,
		bodyRelativeView,
		sceneNearFar,
		type OrbitCamera
	} from '../scene3d/orbitCamera.js';
	import { evaluateScene } from '../scene/driver.js';
	import { getWorldTransform, listBodies } from '../scene/sceneTree.js';
	import { collectSceneLights } from '../scene/collectLights.js';
	import { DEFAULT_LOD_THRESHOLDS, sphereFadeScale, type LodLevel } from '../scene/bodyParams.js';
	import { buildDrawList, type DrawItem } from '../scene3d/drawList.js';
	import { buildProceduralRenderInput } from '../scene3d/proceduralRender.js';
	import {
		MAX_PROCEDURAL_BODIES,
		packBodyTerrainLighting,
		selectProceduralTargets,
		sortProceduralDrawOrder,
		tessellationBudgetScaleForBody,
		type ProceduralRenderTarget
	} from '../scene3d/proceduralBodies.js';
	import { SceneAtmospherePass } from '../scene3d/sceneAtmospherePass.js';
	import { PlanetRenderer } from '../render/planetRenderer.js';
	import { WebGPUBackend } from '../render/WebGPUBackend.js';
	import { invert4 } from '../math/mat4.js';
	import { len3, sub3 } from '../math/vec.js';
	import { DEFAULT_MATERIAL_OVERRIDES } from '../material/biomes.js';
	import { resolveBodyAtmosphere, bodyAtmosphereToParameters } from '../scene/bodyAtmosphere.js';
	import { toGpuAtmosphereParams } from '../params/atmosphereParams.js';
	import type { Vec3 } from '../math/vec.js';
	import type { BodyNode, PlanetScene } from '../scene/types.js';
	import {
		isSceneAtmosphereDebugMode,
		sceneAtmosphereDebugToGpu,
		sceneMaterialDebugMode,
		type SceneDebugMode
	} from '../scene/sceneDebug.js';
	import type { OrbitLookMode } from '../camera/orbitCamera.js';
	import { viewportPrefsRenderDeps, type SceneViewportPrefs } from '../scene/viewportPrefs.js';
	import {
		applyFreeFlyLook,
		buildSceneFreeFlyCameraState,
		EMPTY_FREE_FLY_KEYS,
		freeFlyKeysMoving,
		freeFlyToOrbit,
		orbitEyeToFreeFly,
		sceneFreeFlySpeed,
		sceneFreeFlyViewProjectionRelative,
		stepFreeFly,
		type FreeFlyKeys,
		type FreeFlyState
	} from '../camera/freeFly.js';

	interface Props {
		scene: PlanetScene;
		selectedId?: string | null;
		/** Shared animation clock; re-renders as it advances (driven by the 2D map loop). */
		time?: number;
		/** Material debug view for the procedural layer (parity diagnostic). */
		materialDebug?: SceneDebugMode;
		/** Focused-body look mode (viewport state). */
		lookMode?: OrbitLookMode;
		/** Tessellation, debug overlays, and material overrides (session viewport prefs). */
		viewportPrefs?: SceneViewportPrefs;
	}
	let {
		scene,
		selectedId = $bindable(null),
		time = 0,
		materialDebug = 'off',
		lookMode = 'planet-center',
		viewportPrefs = $bindable()
	}: Props = $props();
	let atmosphereDebugActive = $derived(isSceneAtmosphereDebugMode(materialDebug));
	let atmosphereOnWhite = $derived(materialDebug === 'atmosphereWhite');

	let canvas = $state<HTMLCanvasElement | null>(null);
	let w = $state(1);
	let h = $state(1);
	let failed = $state<string | null>(null);
	/** Selection ring overlay (screen px), null when nothing is selected/visible. */
	let marker = $state<{ x: number; y: number; r: number } | null>(null);
	/** Procedural terrain targets for this frame (up to two bodies). */
	let procTargets = $state<ProceduralRenderTarget[]>([]);

	let device = $state<GPUDevice | null>(null);
	let context: GPUCanvasContext | null = null;
	let format: GPUTextureFormat = 'bgra8unorm';
	let engine: SceneEngine | null = null;
	let spheres: SpherePass | null = null;
	let orbitLines: OrbitLinePass | null = null;
	// Pool of offscreen procedural renderers — one per visible terrain body (independent
	// mode/local-frame state). Terrain records into the shared scene pass via recordInto.
	let proceduralRendererPool: PlanetRenderer[] = [];
	let sceneAtmosphere: SceneAtmospherePass | null = null;

	const BODY_COLOR: Record<BodyNode['bodyType'], [number, number, number]> = {
		star: [1.0, 0.82, 0.5],
		gas_giant: [0.79, 0.64, 0.42],
		planet: [0.42, 0.62, 1.0],
		moon: [0.6, 0.64, 0.72]
	};

	// Orbit params; the target is computed each frame (follows the selection), so the
	// camera tracks a body as it orbits. Stored target stays unused.
	let camera = $state<OrbitCamera>({ azimuth: 0.7, elevation: 0.5, distance: 1.5e8, target: [0, 0, 0] });
	let cameraMode = $state<'orbit' | 'freeFly'>('orbit');
	let freeFly = $state<FreeFlyState>({ position: [0, 0, 0], rotation: [0, 0, 0, 1] });
	let keysPressed = $state<FreeFlyKeys>({ ...EMPTY_FREE_FLY_KEYS });

	/** Camera target: the selected node's live world position, else the system centre. */
	function targetOf(animated: PlanetScene): Vec3 {
		return selectedId ? getWorldTransform(animated, selectedId).position : [0, 0, 0];
	}

	function freeFlyRefRadius(animated: PlanetScene): number {
		if (selectedId) {
			const node = animated.nodes.get(selectedId);
			if (node?.kind === 'body') return node.radiusMeters;
		}
		let max = 6.371e6;
		for (const b of listBodies(animated)) {
			max = Math.max(max, b.radiusMeters);
		}
		return max;
	}

	// Screen-size LOD lives in buildDrawList (dot/sphere/procedural by projected px, with
	// ±15% hysteresis via lodState). A dot renders as a fixed-size point so distant
	// bodies stay visible; sphere/procedural use the true radius (procedural is drawn as
	// a sphere here — the engine swaps it for the real render). lodState persists frames.
	const DOT_RADIUS_PX = 2.5;
	const lodState = new Map<string, LodLevel>();

	function instancesFromDrawList(
		drawList: DrawItem[],
		eye: Vec3,
		excludeIds: ReadonlySet<string> = new Set()
	): BodyInstance[] {
		const screenScale = (1 / Math.tan(FOVY / 2)) * (h / 2);
		const shrinkPercent = viewportPrefs?.lod.sphereShrinkPercent ?? 0;
		const out: BodyInstance[] = [];
		for (const it of drawList) {
			if (!it.screen) continue; // off-screen → cull
			if (excludeIds.has(it.id)) continue; // rendered procedurally instead of as a sphere
			// Recede the base sphere as terrain fades in so deep valleys aren't occluded.
			const radius =
				it.lod === 'dot'
					? (DOT_RADIUS_PX * it.screen.depth) / screenScale
					: it.radiusMeters * sphereFadeScale(it.blend, shrinkPercent);
			out.push({
				// Eye-relative center: the sphere pass renders with the eye-relative VP, so
				// vertices stay near the origin and survive f32 at planetary distances.
				position: sub3(it.worldPos, eye),
				radius,
				color: BODY_COLOR[it.bodyType],
				emissive: it.bodyType === 'star',
				// Pin distant dots to the far plane so a near-fit frustum never clips them.
				marker: it.lod === 'dot'
			});
		}
		return out;
	}

	function lighting(animated: PlanetScene): SceneLighting {
		const col = collectSceneLights(animated);
		// Sun = the (global) point light; its world position is the light position.
		const sun = col.lights.find((l) => l.kind === 'point') ?? col.lights[0];
		return {
			lightPos: sun ? sun.directionOrPosition : [0, 0, 0],
			lightColor: sun ? sun.color : [1, 1, 1],
			lightIntensity: sun ? sun.intensity : 3,
			ambient: col.ambient
		};
	}

	/** Fit the whole system: distance from the farthest body (target = centre). */
	function frameAll() {
		const animated = evaluateScene(scene, time);
		let max = 1;
		for (const b of listBodies(animated)) {
			const p = getWorldTransform(animated, b.id).position;
			max = Math.max(max, Math.hypot(p[0], p[1], p[2]) + b.radiusMeters);
		}
		camera = { ...camera, distance: max * 2.2 };
	}

	// Reframe when the selection changes: zoom to the body, else fit the system.
	$effect(() => {
		const id = selectedId;
		untrack(() => {
			if (!id) {
				frameAll();
				return;
			}
			const node = scene.nodes.get(id);
			if (node && node.kind === 'body') camera = { ...camera, distance: node.radiusMeters * 8 };
		});
	});

	function render() {
		if (!device || !context || !engine || !spheres || !orbitLines) return;
		const animated = evaluateScene(scene, time);
		const aspect = w / h;
		const orbitCam = { ...camera, target: targetOf(animated) };
		// Camera-relative (floating-origin) frame shared by spheres, the draw list, the
		// marker/picking projection, and the atmosphere overlay. Rebasing to the eye keeps
		// f32 precise when bodies sit ~1e11 m from the world origin; clip depth is identical
		// to the absolute view-projection, so the shared depth buffer stays comparable.
		const eye = cameraMode === 'freeFly' ? freeFly.position : cameraEye(orbitCam);
		const visibleOrbitSpecs = collectOrbitPathSpecs(animated).filter((p) => {
			const node = animated.nodes.get(p.keplerNodeId);
			return (
				node &&
				resolveOrbitPathVisible(node, viewportPrefs, selectedId ?? null, animated)
			);
		});
		// Depth range fit to every body in view and visible orbit ellipses (not just the
		// focused body), so far planets and the far side of an orbit stay inside the frustum.
		const nearFar = sceneNearFar(
			eye,
			listBodies(animated).map((b) => ({
				center: getWorldTransform(animated, b.id).position,
				radius: b.radiusMeters
			})),
			[],
			visibleOrbitSpecs.map(orbitPathBoundsForNearFar)
		);
		const vpRel =
			cameraMode === 'freeFly'
				? sceneFreeFlyViewProjectionRelative(freeFly, aspect, nearFar)
				: bodyRelativeView(orbitCam, eye, aspect, nearFar).viewProjection;
		const visibleOrbitPaths = visibleOrbitSpecs.map((spec) => {
			const isSelected = spec.bodyId === selectedId || spec.keplerNodeId === selectedId;
			const orbitMode = viewportPrefs?.overlays.orbitPaths ?? 'all';
			// High tessellation only for the focused path in "selected" mode. In "all"
			// mode every path shares the same LOD so one orbit does not dominate at 4096
			// segments while the system is framed.
			const highLod = orbitMode === 'selected' && isSelected;
			const segments = orbitPathSegmentCount(
				spec.elements,
				len3(sub3(spec.center, eye)),
				h,
				highLod
					? { maxChordPx: 1.5, min: 32, max: 4096 }
					: { maxChordPx: 4, min: 32, max: 256 }
			);
			return buildOrbitPath3D(spec, segments, time);
		});
		const drawList = buildDrawList(animated, vpRel, eye, w, h, lodState, viewportPrefs?.lod ?? DEFAULT_LOD_THRESHOLDS);
		const light = lighting(animated);
		updateMarker(animated, vpRel, eye);
		updateProcedural(animated, drawList);
		const terrainMaterialDebug = sceneMaterialDebugMode(materialDebug);

		// Single pass: spheres + every visible procedural body into shared color+depth.
		const terrainTargets = procTargets;
		const procActive =
			terrainTargets.length > 0 && proceduralRendererPool.length >= terrainTargets.length;
		const hideSphereIds = new Set(
			terrainTargets.filter((t) => t.blend >= 1).map((t) => t.id)
		);
		const instances = instancesFromDrawList(drawList, eye, hideSphereIds);
		// The sphere shader lights via (lightPos - worldPos); both are eye-relative now, so
		// the subtraction is precise. The difference is frame-invariant — only its precision
		// improves.
		const lightRel: SceneLighting = { ...light, lightPos: sub3(light.lightPos, eye) };

		const primaryTarget =
			(selectedId ? terrainTargets.find((t) => t.id === selectedId) : undefined) ??
			terrainTargets[0];

		function proceduralInputFor(target: ProceduralRenderTarget) {
			return buildProceduralRenderInput({
				body: target.body,
				sceneCamera:
					cameraMode === 'freeFly'
						? { mode: 'freeFly', camera: buildSceneFreeFlyCameraState(freeFly, aspect, nearFar) }
						: { mode: 'orbit', camera: orbitCam, lookMode },
				bodyWorldPos: target.worldPos,
				width: w,
				height: h,
				time,
				lighting: packBodyTerrainLighting(animated, target.worldPos),
				planetRotation: target.rotation,
				materialDebug: terrainMaterialDebug,
				viewportPrefs,
				blend: target.blend,
				nearFar,
				tessellationBudgetScale: tessellationBudgetScaleForBody(
					target.id,
					primaryTarget?.id ?? null,
					terrainTargets.length
				)
			});
		}

		let atmoOverlay: SceneOverlayFn | undefined;
		const atmosphereBlendMode = atmosphereDebugActive
			? 'explicit-composite'
			: (viewportPrefs?.atmosphere.blendMode ?? 'explicit-composite');
		if (procActive && sceneAtmosphere) {
			const atmoCandidates = sortProceduralDrawOrder(terrainTargets).filter((t) =>
				resolveAtmosphereVisible(t.body, viewportPrefs)
			);
			const atmoTargets =
				primaryTarget && atmoCandidates.some((t) => t.id === primaryTarget.id)
					? [primaryTarget, ...atmoCandidates.filter((t) => t.id !== primaryTarget.id)]
					: atmoCandidates;
			if (atmoTargets.length > 0) {
				atmoOverlay = (overlay) =>
					sceneAtmosphere!.record(
						overlay.pass,
						overlay.compositeSourceView,
						overlay.depthView,
						overlay.surfaceDistanceView,
						{
							invViewProjection: invert4(vpRel),
							viewProjection: vpRel,
							cameraWorldPos: eye,
							bodies: atmoTargets.map((target) => {
								const input = proceduralInputFor(target);
								return {
									atmosphere: toGpuAtmosphereParams(
										bodyAtmosphereToParameters(
											resolveBodyAtmosphere(target.body),
											viewportPrefs?.atmosphereIntegrateSteps
										),
										target.body.radiusMeters,
										sub3(target.worldPos, eye)
									),
									opacity: atmosphereDebugActive
										? 1
										: input.materialOverrides.objectOpacity
								};
							}),
							lighting: packBodyTerrainLighting(animated, eye),
							materialOverrides: {
								...(viewportPrefs?.materialOverrides ?? DEFAULT_MATERIAL_OVERRIDES),
								materialDebug: terrainMaterialDebug
							},
							width: w,
							height: h,
							debugMode: sceneAtmosphereDebugToGpu(materialDebug)
						},
						overlay.mode
					);
			}
		}

		engine.render(
			context.getCurrentTexture().createView(),
			w,
			h,
			(pass) => {
				if (!atmosphereOnWhite) spheres!.record(pass, instances, vpRel, lightRel);
				orbitLines!.record(pass, visibleOrbitPaths, vpRel, eye);
				if (procActive) {
					const drawOrder = sortProceduralDrawOrder(terrainTargets);
					for (let i = 0; i < drawOrder.length; i++) {
						const target = drawOrder[i]!;
						proceduralRendererPool[i]!.recordInto(
							pass,
							proceduralInputFor(target),
							{ surfaceOnly: atmosphereOnWhite }
						);
					}
				}
			},
			atmoOverlay,
			atmosphereOnWhite ? { r: 1, g: 1, b: 1, a: 1 } : undefined,
			atmosphereBlendMode
		);
	}

	/** Project the selected node to a screen-space ring sized to its body. */
	function updateMarker(animated: PlanetScene, vpRel: Float32Array, eye: Vec3) {
		const node = selectedId ? animated.nodes.get(selectedId) : null;
		if (!node) {
			marker = null;
			return;
		}
		const sp = projectToScreen(
			vpRel,
			sub3(getWorldTransform(animated, selectedId!).position, eye),
			w,
			h
		);
		if (!sp) {
			marker = null;
			return;
		}
		const radius = node.kind === 'body' ? node.radiusMeters : 0;
		const screenR = radius > 0 ? (radius / sp.depth) * (1 / Math.tan(FOVY / 2)) * (h / 2) : 0;
		marker = { x: sp.x, y: sp.y, r: Math.max(screenR, 8) + 5 };
	}

	/** Procedural terrain targets: every planet/moon in view with an active LOD cross-fade. */
	function updateProcedural(animated: PlanetScene, drawList: DrawItem[]) {
		procTargets = selectProceduralTargets(drawList, scene, animated, selectedId ?? null);
	}

	/** Pick the front-most body whose projected disc contains the click; else deselect. */
	function pick(clientX: number, clientY: number) {
		if (!canvas || cameraMode === 'freeFly') return;
		const rect = canvas.getBoundingClientRect();
		const px = clientX - rect.left;
		const py = clientY - rect.top;
		const animated = evaluateScene(scene, time);
		const orbitCam = { ...camera, target: targetOf(animated) };
		const eye = cameraEye(orbitCam);
		const vpRel = bodyRelativeView(orbitCam, eye, w / h).viewProjection;
		let best: { id: string; depth: number } | null = null;
		for (const b of listBodies(animated)) {
			const sp = projectToScreen(vpRel, sub3(getWorldTransform(animated, b.id).position, eye), w, h);
			if (!sp) continue;
			const screenR = (b.radiusMeters / sp.depth) * (1 / Math.tan(FOVY / 2)) * (h / 2);
			const hitR = Math.max(screenR, 8);
			if (Math.hypot(px - sp.x, py - sp.y) > hitR) continue;
			if (!best || sp.depth < best.depth) best = { id: b.id, depth: sp.depth };
		}
		selectedId = best ? best.id : null;
	}

	let dragging = false;
	let dollyDrag = false;
	let moved = false;
	let lastX = 0;
	let lastY = 0;
	let downX = 0;
	let downY = 0;
	const MIN_ORBIT_DISTANCE = 1e5;
	const DOLLY_DRAG_SENSITIVITY = 0.005;

	function onPointerDown(e: PointerEvent) {
		if (cameraMode === 'freeFly') {
			if (document.pointerLockElement !== canvas) {
				canvas?.requestPointerLock();
			}
			return;
		}
		dragging = true;
		dollyDrag = e.ctrlKey;
		moved = false;
		lastX = downX = e.clientX;
		lastY = downY = e.clientY;
		canvas?.setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (cameraMode === 'freeFly') {
			if (document.pointerLockElement !== canvas) return;
			freeFly = {
				...freeFly,
				rotation: applyFreeFlyLook(freeFly.rotation, e.movementX, e.movementY)
			};
			requestRender();
			ensureFlyLoop();
			return;
		}
		if (!dragging) return;
		if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true; // drag, not a click
		if (!moved) return;
		const dx = e.clientX - lastX;
		const dy = e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		if (dollyDrag) {
			camera = {
				...camera,
				distance: Math.max(
					MIN_ORBIT_DISTANCE,
					camera.distance * (1 + dy * DOLLY_DRAG_SENSITIVITY)
				)
			};
		} else {
			camera = {
				...camera,
				azimuth: camera.azimuth - dx * 0.01,
				elevation: clampElevation(camera.elevation + dy * 0.01)
			};
		}
	}
	function onPointerUp(e: PointerEvent) {
		if (cameraMode === 'freeFly') return;
		dragging = false;
		dollyDrag = false;
		canvas?.releasePointerCapture?.(e.pointerId);
		if (!moved) pick(e.clientX, e.clientY); // a click → select
	}
	function onWheel(e: WheelEvent) {
		if (cameraMode === 'freeFly') return;
		e.preventDefault();
		camera = {
			...camera,
			distance: Math.max(MIN_ORBIT_DISTANCE, camera.distance * (1 + Math.sign(e.deltaY) * 0.12))
		};
	}

	function enterFreeFly() {
		if (cameraMode === 'freeFly') return;
		const animated = evaluateScene(scene, time);
		freeFly = orbitEyeToFreeFly({ ...camera, target: targetOf(animated) });
		cameraMode = 'freeFly';
		keysPressed = { ...EMPTY_FREE_FLY_KEYS };
		canvas?.requestPointerLock();
		ensureFlyLoop();
	}

	function exitFreeFly() {
		if (cameraMode !== 'freeFly') return;
		document.exitPointerLock();
	}

	function toggleFreeFly() {
		if (cameraMode === 'freeFly') exitFreeFly();
		else enterFreeFly();
	}

	function handlePointerLockChange() {
		if (document.pointerLockElement === canvas || cameraMode !== 'freeFly') return;
		const animated = evaluateScene(scene, time);
		camera = freeFlyToOrbit(freeFly, targetOf(animated));
		cameraMode = 'orbit';
		keysPressed = { ...EMPTY_FREE_FLY_KEYS };
		requestRender();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (cameraMode !== 'freeFly') return;
		const key = e.key.toLowerCase();
		if (e.key === 'Escape') {
			exitFreeFly();
			return;
		}
		let changed = false;
		if (key === 'w' && !keysPressed.w) {
			keysPressed.w = true;
			changed = true;
		}
		if (key === 'a' && !keysPressed.a) {
			keysPressed.a = true;
			changed = true;
		}
		if (key === 's' && !keysPressed.s) {
			keysPressed.s = true;
			changed = true;
		}
		if (key === 'd' && !keysPressed.d) {
			keysPressed.d = true;
			changed = true;
		}
		if (key === 'q' && !keysPressed.q) {
			keysPressed.q = true;
			changed = true;
		}
		if (key === 'e' && !keysPressed.e) {
			keysPressed.e = true;
			changed = true;
		}
		if (e.shiftKey) keysPressed.shift = true;
		if (changed) {
			requestRender();
			ensureFlyLoop();
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		if (cameraMode !== 'freeFly') return;
		const key = e.key.toLowerCase();
		if (key === 'w') keysPressed.w = false;
		if (key === 'a') keysPressed.a = false;
		if (key === 's') keysPressed.s = false;
		if (key === 'd') keysPressed.d = false;
		if (key === 'q') keysPressed.q = false;
		if (key === 'e') keysPressed.e = false;
		if (!e.shiftKey) keysPressed.shift = false;
	}

	let flyRaf = 0;
	let lastFlyTime = 0;

	function ensureFlyLoop() {
		if (flyRaf || cameraMode !== 'freeFly') return;
		lastFlyTime = performance.now();
		const tick = (now: number) => {
			if (cameraMode !== 'freeFly') {
				flyRaf = 0;
				return;
			}
			const dt = lastFlyTime > 0 ? (now - lastFlyTime) / 1000 : 0;
			lastFlyTime = now;
			if (dt > 0 && freeFlyKeysMoving(keysPressed)) {
				const animated = evaluateScene(scene, time);
				const speed = sceneFreeFlySpeed(freeFly.position, freeFlyRefRadius(animated));
				freeFly = stepFreeFly(freeFly, keysPressed, dt, speed);
				requestRender();
			}
			if (
				freeFlyKeysMoving(keysPressed) ||
				document.pointerLockElement === canvas
			) {
				flyRaf = requestAnimationFrame(tick);
			} else {
				flyRaf = 0;
			}
		};
		flyRaf = requestAnimationFrame(tick);
	}

	// Render on demand: re-render only when an input actually changes. When the clock is
	// paused it stops advancing, so nothing re-renders and the scene truly freezes (no
	// wasted frames). The earlier continuous loop ran every frame regardless. Everything
	// is now one pass in render() (spheres + terrain), so there's no separate layer to
	// desync — the stall that motivated the old continuous loop is gone with the overlay.
	let raf = 0;
	function requestRender() {
		if (raf) return; // a render is already queued for the next frame
		raf = requestAnimationFrame(() => {
			raf = 0;
			render();
		});
	}

	// Track every render input; any change schedules one render. The clock (`time`) is the
	// playing-animation driver, so a paused clock yields no re-render.
	$effect(() => {
		void time;
		void scene;
		void selectedId;
		void materialDebug;
		void lookMode;
		viewportPrefsRenderDeps(viewportPrefs);
		void camera;
		void cameraMode;
		void freeFly;
		void keysPressed;
		void w;
		void h;
		requestRender();
	});

	onMount(() => {
		const el = canvas;
		if (!el) return;
		document.addEventListener('pointerlockchange', handlePointerLockChange);
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		let disposed = false;
		(async () => {
			try {
				const r = await requestWebGPUDevice();
				if (disposed) return;
				device = r.device;
				format = navigator.gpu.getPreferredCanvasFormat();
				context = configureWebGPUCanvas(device, el, format);
				engine = new SceneEngine(device, format);
				spheres = new SpherePass(device, format);
				orbitLines = new OrbitLinePass(device, format);
				sceneAtmosphere = new SceneAtmospherePass(device, format);
				const pool: PlanetRenderer[] = [];
				for (let i = 0; i < MAX_PROCEDURAL_BODIES; i++) {
					const renderer = new PlanetRenderer(new WebGPUBackend());
					await renderer.init(null, device);
					pool.push(renderer);
				}
				proceduralRendererPool = pool;
				if (disposed) return;
				frameAll();
				requestRender(); // first paint now that the device is ready
			} catch (err) {
				failed = err instanceof Error ? err.message : 'WebGPU unavailable';
			}
		})();
		const ro = new ResizeObserver(() => {
			w = el.clientWidth || 1;
			h = el.clientHeight || 1;
			el.width = w;
			el.height = h;
		});
		ro.observe(el);
		w = el.clientWidth || 1;
		h = el.clientHeight || 1;
		el.width = w;
		el.height = h;
		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			cancelAnimationFrame(flyRaf);
			document.removeEventListener('pointerlockchange', handlePointerLockChange);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			ro.disconnect();
			sceneAtmosphere?.destroy();
			for (const renderer of proceduralRendererPool) renderer.destroy();
			proceduralRendererPool = [];
			spheres?.destroy();
			orbitLines?.destroy();
			engine?.destroy();
		};
	});
</script>

<div class="viewport-3d">
	<canvas
		bind:this={canvas}
		class="canvas3d"
		aria-label="3D system view"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onwheel={onWheel}
	></canvas>
	{#if marker && !atmosphereDebugActive}
		<div
			class="sel-ring"
			style="left:{marker.x}px; top:{marker.y}px; width:{marker.r * 2}px; height:{marker.r * 2}px;"
		></div>
	{/if}
	{#if !atmosphereDebugActive}
		<button type="button" class="frame-btn" onclick={() => (selectedId = null)}>Frame all</button>
		<button
			type="button"
			class="frame-btn fly-btn"
			class:active={cameraMode === 'freeFly'}
			onclick={toggleFreeFly}
		>
			{cameraMode === 'freeFly' ? 'Fly Mode: Active (Esc)' : 'Enter WASD Fly Mode'}
		</button>
	{/if}
	{#if failed}
		<div class="overlay">3D unavailable: {failed} — use the 2D map.</div>
	{/if}
</div>

<style>
	.viewport-3d {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 320px;
	}

	.canvas3d {
		width: 100%;
		height: 100%;
		display: block;
		border-radius: 8px;
		background: #060810;
		touch-action: none;
		cursor: grab;
	}

	.canvas3d:active {
		cursor: grabbing;
	}

	.sel-ring {
		position: absolute;
		transform: translate(-50%, -50%);
		border: 2px solid #9ec0ff;
		border-radius: 50%;
		box-shadow: 0 0 8px rgba(158, 192, 255, 0.7);
		pointer-events: none;
	}

	.frame-btn {
		position: absolute;
		top: 10px;
		left: 10px;
		font: 11px/1.2 system-ui, sans-serif;
		padding: 3px 8px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(26, 31, 48, 0.85);
		color: #e8ecf8;
		cursor: pointer;
	}

	.fly-btn {
		left: auto;
		right: 10px;
	}

	.fly-btn.active {
		border-color: rgba(158, 192, 255, 0.55);
		background: rgba(60, 90, 140, 0.9);
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 12px;
		text-align: center;
		font: 12px/1.4 system-ui, sans-serif;
		color: #e8ecf8;
		background: rgba(6, 8, 16, 0.7);
		border-radius: 8px;
	}
</style>
