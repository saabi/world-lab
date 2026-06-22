<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { requestWebGPUDevice, configureWebGPUCanvas } from '../render/device.js';
	import { SceneEngine } from '../scene3d/sceneEngine.js';
	import { SpherePass, type BodyInstance, type SceneLighting } from '../scene3d/spherePass.js';
	import {
		clampElevation,
		FOVY,
		projectToScreen,
		viewProjection,
		type OrbitCamera
	} from '../scene3d/orbitCamera.js';
	import { evaluateScene } from '../scene/driver.js';
	import { getWorldTransform, listBodies } from '../scene/sceneTree.js';
	import { collectSceneLights } from '../scene/collectLights.js';
	import { packSceneLighting } from '../scene/packLighting.js';
	import type { LodLevel } from '../scene/bodyParams.js';
	import { buildDrawList, type DrawItem } from '../scene3d/drawList.js';
	import ProceduralBodyLayer from './ProceduralBodyLayer.svelte';
	import { normalize3, sub3, type Vec3 } from '../math/vec.js';
	import type { LightingUniforms } from '../render/uniformLayouts.js';
	import type { BodyNode, PlanetScene, Quat } from '../scene/types.js';
	import type { MaterialDebugMode } from '../material/biomes.js';
	import type { OrbitLookMode } from '../camera/orbitCamera.js';

	interface AtmoDebug {
		enabled: boolean;
		rayleigh: number;
		mie: number;
		fog: number;
	}
	interface Props {
		scene: PlanetScene;
		selectedId?: string | null;
		/** Shared animation clock; re-renders as it advances (driven by the 2D map loop). */
		time?: number;
		/** Live atmosphere debug knobs (passed to the procedural layer). */
		atmo: AtmoDebug;
		/** Material debug view for the procedural layer (parity diagnostic). */
		materialDebug?: MaterialDebugMode;
		/** Focused-body look mode (viewport state). */
		lookMode?: OrbitLookMode;
	}
	let {
		scene,
		selectedId = $bindable(null),
		time = 0,
		atmo,
		materialDebug = 'off',
		lookMode = 'planet-center'
	}: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let w = $state(1);
	let h = $state(1);
	let failed = $state<string | null>(null);
	/** Selection ring overlay (screen px), null when nothing is selected/visible. */
	let marker = $state<{ x: number; y: number; r: number } | null>(null);
	/** Procedural cross-fade: the selected planet/moon (stable ref) + its blend 0..1. */
	let procBody = $state<BodyNode | null>(null);
	let procBlend = $state(0);
	/** The selected body's live world position, for the layer's world-coord render. */
	let procWorldPos = $state<Vec3>([0, 0, 0]);
	/** The selected body's evaluated body-space rotation (spin/tilt), for terrain sampling. */
	let procRotation = $state<Quat>([0, 0, 0, 1]);
	/** Feathered disc (screen px) to mask the procedural layer to its planet + atmosphere,
	 *  so the rest of the layer is transparent and the scene shows through. */
	let procMask = $state<{ x: number; y: number; r0: number; r1: number } | null>(null);
	/** Packed lighting for the procedural layer: the sun as a directional light toward Sol. */
	let procLighting = $state<LightingUniforms>(packSceneLighting({ ambient: [0, 0, 0], lights: [] }));

	let device: GPUDevice | null = null;
	let context: GPUCanvasContext | null = null;
	let engine: SceneEngine | null = null;
	let spheres: SpherePass | null = null;

	const BODY_COLOR: Record<BodyNode['bodyType'], [number, number, number]> = {
		star: [1.0, 0.82, 0.5],
		gas_giant: [0.79, 0.64, 0.42],
		planet: [0.42, 0.62, 1.0],
		moon: [0.6, 0.64, 0.72]
	};

	// Orbit params; the target is computed each frame (follows the selection), so the
	// camera tracks a body as it orbits. Stored target stays unused.
	let camera = $state<OrbitCamera>({ azimuth: 0.7, elevation: 0.5, distance: 1.5e8, target: [0, 0, 0] });

	/** Camera target: the selected node's live world position, else the system centre. */
	function targetOf(animated: PlanetScene): Vec3 {
		return selectedId ? getWorldTransform(animated, selectedId).position : [0, 0, 0];
	}


	// Screen-size LOD lives in buildDrawList (dot/sphere/procedural by projected px, with
	// ±15% hysteresis via lodState). A dot renders as a fixed-size point so distant
	// bodies stay visible; sphere/procedural use the true radius (procedural is drawn as
	// a sphere here — the engine swaps it for the real render). lodState persists frames.
	const DOT_RADIUS_PX = 2.5;
	const lodState = new Map<string, LodLevel>();

	function instancesFromDrawList(drawList: DrawItem[]): BodyInstance[] {
		const screenScale = (1 / Math.tan(FOVY / 2)) * (h / 2);
		const out: BodyInstance[] = [];
		for (const it of drawList) {
			if (!it.screen) continue; // off-screen → cull
			const radius = it.lod === 'dot' ? (DOT_RADIUS_PX * it.screen.depth) / screenScale : it.radiusMeters;
			out.push({
				position: it.worldPos,
				radius,
				color: BODY_COLOR[it.bodyType],
				emissive: it.bodyType === 'star'
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
		if (!device || !context || !engine || !spheres) return;
		const animated = evaluateScene(scene, time);
		const cam = { ...camera, target: targetOf(animated) };
		const vp = viewProjection(cam, w / h);
		const drawList = buildDrawList(animated, vp, w, h, lodState);
		const instances = instancesFromDrawList(drawList);
		const light = lighting(animated);
		engine.render(context.getCurrentTexture().createView(), w, h, (pass) => {
			spheres!.record(pass, instances, vp, light);
		});
		updateMarker(animated, vp);
		updateProcedural(animated, drawList);
	}

	/** Project the selected node to a screen-space ring sized to its body. */
	function updateMarker(animated: PlanetScene, vp: Float32Array) {
		const node = selectedId ? animated.nodes.get(selectedId) : null;
		if (!node) {
			marker = null;
			return;
		}
		const sp = projectToScreen(vp, getWorldTransform(animated, selectedId!).position, w, h);
		if (!sp) {
			marker = null;
			return;
		}
		const radius = node.kind === 'body' ? node.radiusMeters : 0;
		const screenR = radius > 0 ? (radius / sp.depth) * (1 / Math.tan(FOVY / 2)) * (h / 2) : 0;
		marker = { x: sp.x, y: sp.y, r: Math.max(screenR, 8) + 5 };
	}

	/** Procedural cross-fade for the selected planet/moon, from its draw-list item (uses
	 *  the stable scene node so the layer's body prop doesn't churn each frame). */
	function updateProcedural(animated: PlanetScene, drawList: DrawItem[]) {
		const item = selectedId ? drawList.find((d) => d.id === selectedId) : undefined;
		const node = selectedId ? scene.nodes.get(selectedId) : null;
		if (
			item?.screen &&
			node?.kind === 'body' &&
			(node.bodyType === 'planet' || node.bodyType === 'moon')
		) {
			procBlend = item.blend;
			procBody = item.blend > 0 ? node : null;
			procWorldPos = item.worldPos;
			procRotation = getWorldTransform(animated, node.id).rotation;
			// Mask the layer to the planet disc + an atmosphere feather; rest transparent.
			const r = item.screenPx / 2;
			procMask = procBody ? { x: item.screen.x, y: item.screen.y, r0: r, r1: r * 1.35 } : null;
			if (procBody) {
				// Sun as a directional light toward Sol, in the body's (untilted) frame.
				const col = collectSceneLights(animated);
				const sun = col.lights.find((l) => l.kind === 'point') ?? col.lights[0];
				const sunDir: Vec3 = sun ? normalize3(sub3(sun.directionOrPosition, item.worldPos)) : [0, 1, 0];
				procLighting = packSceneLighting({
					ambient: col.ambient,
					lights: [
						{
							kind: 'directional',
							directionOrPosition: sunDir,
							color: sun?.color ?? [1, 1, 1],
							intensity: sun?.intensity ?? 3,
							range: 0
						}
					]
				});
			}
			return;
		}
		procBlend = 0;
		procBody = null;
		procMask = null;
	}

	const procStyle = $derived.by(() => {
		if (!procMask) return `opacity:${procBlend}`;
		const g = `radial-gradient(circle at ${procMask.x}px ${procMask.y}px, #000 ${procMask.r0}px, transparent ${procMask.r1}px)`;
		return `opacity:${procBlend}; mask-image:${g}; -webkit-mask-image:${g};`;
	});

	/** Pick the front-most body whose projected disc contains the click; else deselect. */
	function pick(clientX: number, clientY: number) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const px = clientX - rect.left;
		const py = clientY - rect.top;
		const animated = evaluateScene(scene, time);
		const vp = viewProjection({ ...camera, target: targetOf(animated) }, w / h);
		let best: { id: string; depth: number } | null = null;
		for (const b of listBodies(animated)) {
			const sp = projectToScreen(vp, getWorldTransform(animated, b.id).position, w, h);
			if (!sp) continue;
			const screenR = (b.radiusMeters / sp.depth) * (1 / Math.tan(FOVY / 2)) * (h / 2);
			const hitR = Math.max(screenR, 8);
			if (Math.hypot(px - sp.x, py - sp.y) > hitR) continue;
			if (!best || sp.depth < best.depth) best = { id: b.id, depth: sp.depth };
		}
		selectedId = best ? best.id : null;
	}

	let dragging = false;
	let moved = false;
	let lastX = 0;
	let lastY = 0;
	let downX = 0;
	let downY = 0;
	function onPointerDown(e: PointerEvent) {
		dragging = true;
		moved = false;
		lastX = downX = e.clientX;
		lastY = downY = e.clientY;
		canvas?.setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true; // drag, not a click
		if (!moved) return;
		const dx = e.clientX - lastX;
		const dy = e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		camera = {
			...camera,
			azimuth: camera.azimuth - dx * 0.01,
			elevation: clampElevation(camera.elevation + dy * 0.01)
		};
	}
	function onPointerUp(e: PointerEvent) {
		dragging = false;
		canvas?.releasePointerCapture?.(e.pointerId);
		if (!moved) pick(e.clientX, e.clientY); // a click → select
	}
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		camera = { ...camera, distance: Math.max(1e5, camera.distance * (1 + Math.sign(e.deltaY) * 0.12)) };
	}

	// Continuous render loop — the sphere scene AND the procedural mask update every
	// frame, in lockstep with the clock and the procedural layer. (A reactive $effect
	// stalled once the heavy procedural layer mounted, freezing the mask while the
	// planet kept moving.) render() no-ops until the device is ready.
	let raf = 0;
	function loop() {
		render();
		raf = requestAnimationFrame(loop);
	}

	onMount(() => {
		const el = canvas;
		if (!el) return;
		let disposed = false;
		(async () => {
			try {
				const r = await requestWebGPUDevice();
				if (disposed) return;
				device = r.device;
				const format = navigator.gpu.getPreferredCanvasFormat();
				context = configureWebGPUCanvas(device, el, format);
				engine = new SceneEngine(device, format);
				spheres = new SpherePass(device, format);
				frameAll();
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
		raf = requestAnimationFrame(loop);
		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			ro.disconnect();
			spheres?.destroy();
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
	{#if procBody && procBlend > 0}
		<div class="proc-wrap" style={procStyle}>
			<ProceduralBodyLayer
				body={procBody}
				{camera}
				bodyWorldPos={procWorldPos}
				planetRotation={procRotation}
				lighting={procLighting}
				{atmo}
				{materialDebug}
				{lookMode}
			/>
		</div>
	{/if}
	{#if marker}
		<div
			class="sel-ring"
			style="left:{marker.x}px; top:{marker.y}px; width:{marker.r * 2}px; height:{marker.r * 2}px;"
		></div>
	{/if}
	<button type="button" class="frame-btn" onclick={() => (selectedId = null)}>Frame all</button>
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

	.proc-wrap {
		position: absolute;
		inset: 0;
		pointer-events: none;
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
