<script lang="ts">
	import { onMount } from 'svelte';
	import { requestWebGPUDevice, configureWebGPUCanvas } from '../render/device.js';
	import { SceneRenderer, type BodyInstance, type SceneLighting } from '../scene3d/sceneRenderer.js';
	import { clampElevation, viewProjection, type OrbitCamera } from '../scene3d/orbitCamera.js';
	import { evaluateScene } from '../scene/driver.js';
	import { getWorldTransform, listBodies } from '../scene/sceneTree.js';
	import { collectSceneLights } from '../scene/collectLights.js';
	import type { BodyNode, PlanetScene } from '../scene/types.js';

	interface Props {
		scene: PlanetScene;
		selectedId?: string | null;
		/** Shared animation clock; re-renders as it advances (driven by the 2D map loop). */
		time?: number;
	}
	let { scene, selectedId = null, time = 0 }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let w = $state(1);
	let h = $state(1);
	let failed = $state<string | null>(null);

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

	let camera = $state<OrbitCamera>({ azimuth: 0.7, elevation: 0.5, distance: 1.5e8, target: [0, 0, 0] });

	function buildInstances(animated: PlanetScene): BodyInstance[] {
		return listBodies(animated).map((b) => ({
			position: getWorldTransform(animated, b.id).position,
			radius: b.radiusMeters,
			color: BODY_COLOR[b.bodyType],
			emissive: b.bodyType === 'star'
		}));
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

	/** Frame the whole system: target the centre, distance from the farthest body. */
	function frame(animated: PlanetScene) {
		let max = 1;
		for (const b of listBodies(animated)) {
			const p = getWorldTransform(animated, b.id).position;
			max = Math.max(max, Math.hypot(p[0], p[1], p[2]) + b.radiusMeters);
		}
		camera = { ...camera, target: [0, 0, 0], distance: max * 2.2 };
	}

	function render() {
		if (!device || !context || !renderer) return;
		const animated = evaluateScene(scene, time);
		renderer.render(
			context.getCurrentTexture().createView(),
			w,
			h,
			buildInstances(animated),
			viewProjection(camera, w / h),
			lighting(animated)
		);
	}

	let dragging = false;
	let lastX = 0;
	let lastY = 0;
	function onPointerDown(e: PointerEvent) {
		dragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		canvas?.setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
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
				frame(evaluateScene(scene, time));
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
