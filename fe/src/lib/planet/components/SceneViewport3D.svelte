<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { requestWebGPUDevice, configureWebGPUCanvas } from '../render/device.js';
	import { SceneRenderer, type BodyInstance, type SceneLighting } from '../scene3d/sceneRenderer.js';
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
	import { proceduralBlend, resolveBodyParams, selectLod, type LodLevel } from '../scene/bodyParams.js';
	import ProceduralBodyLayer from './ProceduralBodyLayer.svelte';
	import { normalize3, sub3, type Vec3 } from '../math/vec.js';
	import type { LightingUniforms } from '../render/uniformLayouts.js';
	import type { BodyNode, PlanetScene } from '../scene/types.js';

	interface Props {
		scene: PlanetScene;
		selectedId?: string | null;
		/** Shared animation clock; re-renders as it advances (driven by the 2D map loop). */
		time?: number;
	}
	let { scene, selectedId = $bindable(null), time = 0 }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let w = $state(1);
	let h = $state(1);
	let failed = $state<string | null>(null);
	/** Selection ring overlay (screen px), null when nothing is selected/visible. */
	let marker = $state<{ x: number; y: number; r: number } | null>(null);
	/** Procedural cross-fade: the selected planet/moon (stable ref) + its blend 0..1. */
	let procBody = $state<BodyNode | null>(null);
	let procBlend = $state(0);
	/** Feathered disc (screen px) to mask the procedural layer to its planet + atmosphere,
	 *  so the rest of the layer is transparent and the scene shows through. */
	let procMask = $state<{ x: number; y: number; r0: number; r1: number } | null>(null);
	/** Packed lighting for the procedural layer: the sun as a directional light toward Sol. */
	let procLighting = $state<LightingUniforms>(packSceneLighting({ ambient: [0, 0, 0], lights: [] }));

	let device: GPUDevice | null = null;
	let context: GPUCanvasContext | null = null;
	let renderer: SceneRenderer | null = null;
	let ready = $state(false);

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

	// Procedural-layer camera distance: scale the scene distance into the body's
	// render-space so the procedural planet matches its sphere's on-screen size.
	const procDistance = $derived(
		procBody ? (resolveBodyParams(procBody).radius * camera.distance) / procBody.radiusMeters : 1
	);

	// Screen-size LOD. A body's projected pixel diameter picks dot / sphere / procedural
	// (selectLod); a sub-threshold body renders as a fixed-size point so it stays
	// visible, larger ones as their true-size sphere. (Procedural is drawn as a sphere
	// until the procedural pipeline lands — Phase 4.) Per-body hysteresis (±15%) avoids
	// flicker at the boundary; lodState persists across frames.
	const DOT_RADIUS_PX = 2.5;
	const RANK: Record<LodLevel, number> = { dot: 0, sphere: 1, procedural: 2 };
	const lodState = new Map<string, LodLevel>();

	function lodFor(b: BodyNode, px: number): LodLevel {
		const prev = lodState.get(b.id);
		let level = selectLod(b, px);
		if (prev && level !== prev) {
			if (RANK[level] > RANK[prev] && RANK[selectLod(b, px / 1.15)] <= RANK[prev]) level = prev;
			else if (RANK[level] < RANK[prev] && RANK[selectLod(b, px * 1.15)] >= RANK[prev]) level = prev;
		}
		lodState.set(b.id, level);
		return level;
	}

	function buildInstances(animated: PlanetScene, vp: Float32Array): BodyInstance[] {
		const screenScale = (1 / Math.tan(FOVY / 2)) * (h / 2);
		const out: BodyInstance[] = [];
		for (const b of listBodies(animated)) {
			const position = getWorldTransform(animated, b.id).position;
			const sp = projectToScreen(vp, position, w, h);
			if (!sp) continue; // behind the camera → cull
			const pxDiameter = 2 * (b.radiusMeters / sp.depth) * screenScale;
			const level = lodFor(b, pxDiameter);
			const radius = level === 'dot' ? (DOT_RADIUS_PX * sp.depth) / screenScale : b.radiusMeters;
			out.push({
				position,
				radius,
				color: BODY_COLOR[b.bodyType],
				emissive: b.bodyType === 'star'
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
		if (!device || !context || !renderer) return;
		const animated = evaluateScene(scene, time);
		const cam = { ...camera, target: targetOf(animated) };
		const vp = viewProjection(cam, w / h);
		renderer.render(
			context.getCurrentTexture().createView(),
			w,
			h,
			buildInstances(animated, vp),
			vp,
			lighting(animated)
		);
		updateMarker(animated, vp);
		updateProcedural(animated, vp);
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

	/** Fade factor for the procedural layer of the selected planet/moon (uses the
	 *  stable scene node so the layer's body prop doesn't churn each frame). */
	function updateProcedural(animated: PlanetScene, vp: Float32Array) {
		const node = selectedId ? scene.nodes.get(selectedId) : null;
		if (node && node.kind === 'body' && (node.bodyType === 'planet' || node.bodyType === 'moon')) {
			const bodyPos = getWorldTransform(animated, node.id).position;
			const sp = projectToScreen(vp, bodyPos, w, h);
			if (sp) {
				const px = 2 * (node.radiusMeters / sp.depth) * ((1 / Math.tan(FOVY / 2)) * (h / 2));
				procBlend = proceduralBlend(node, px);
				procBody = procBlend > 0 ? node : null;
				// Mask the layer to the planet disc + an atmosphere feather; rest transparent.
				const r = px / 2;
				procMask = procBody ? { x: sp.x, y: sp.y, r0: r, r1: r * 1.35 } : null;
				if (procBody) {
					// Sun as a directional light toward Sol, in the body's (untilted) frame.
					const col = collectSceneLights(animated);
					const sun = col.lights.find((l) => l.kind === 'point') ?? col.lights[0];
					const sunDir: Vec3 = sun ? normalize3(sub3(sun.directionOrPosition, bodyPos)) : [0, 1, 0];
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

	// Re-render whenever the scene, clock, camera, or size changes.
	$effect(() => {
		void scene;
		void time;
		void camera;
		void w;
		void h;
		void ready;
		void selectedId;
		render();
	});

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
				renderer = new SceneRenderer(device, format);
				frameAll();
				ready = true; // triggers the render effect
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
			ro.disconnect();
			renderer?.destroy();
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
				azimuth={camera.azimuth}
				elevation={camera.elevation}
				distance={procDistance}
				lighting={procLighting}
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
