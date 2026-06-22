<script lang="ts">
	import { onMount } from 'svelte';
	import { WebGPUBackend } from '../render/WebGPUBackend.js';
	import { PlanetRenderer } from '../render/planetRenderer.js';
	import { focusedBodyCamera } from '../camera/orbitCamera.js';
	import { resolveBodyParams } from '../scene/bodyParams.js';
	import { defaultAtmosphereParams } from '../params/atmosphereParams.js';
	import { DEFAULT_TESSELLATION } from '../patches/tessellationSettings.js';
	import { DEFAULT_MATERIAL_OVERRIDES } from '../material/biomes.js';
	import { collectSceneLighting } from '../scene/collectLights.js';
	import { packSceneLighting } from '../scene/packLighting.js';
	import { createDefaultPlanetScene } from '../scene/defaults.js';
	import type { LightingUniforms } from '../render/uniformLayouts.js';
	import type { BodyNode } from '../scene/types.js';

	interface Props {
		body: BodyNode;
		onclose?: () => void;
	}
	let { body, onclose }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let w = $state(1);
	let h = $state(1);
	let failed = $state<string | null>(null);
	let ready = false;

	let renderer: PlanetRenderer | null = null;
	let backend: WebGPUBackend | null = null;
	/** Route render through an offscreen target + copy (the 4b compositing path). */
	let offscreen = $state(false);
	let raf = 0;
	// Default starlight (same as /planet's initial), packed once.
	const lighting: LightingUniforms = packSceneLighting(
		collectSceneLighting(createDefaultPlanetScene(), true)
	);

	// Orbit-about-body camera (the planet renders in its own ~unit space — physical
	// radiusMeters matters only when composited into the scene, Phase 4b).
	let azimuth = 0.6;
	let elevation = 0.35;
	let distance = 1; // set from the body's radius on mount

	function frame(ts: number) {
		if (renderer && ready && w > 0 && h > 0) {
			const params = resolveBodyParams(body);
			// Shared focused-body camera (plan Phase 1): orbit and look at the body.
			const camera = focusedBodyCamera({
				azimuth,
				elevation,
				distance,
				planetRadius: params.radius,
				aspect: w / Math.max(h, 1),
				lookMode: 'planet-center'
			});
			renderer.render({
				time: ts * 0.001,
				camera,
				width: w,
				height: h,
				params,
				tessellation: DEFAULT_TESSELLATION,
				debug: { wireframe: false, faceColors: false, showPatchBorders: false, showRingColors: false },
				lighting,
				materialOverrides: DEFAULT_MATERIAL_OVERRIDES,
				atmosphere: defaultAtmosphereParams(params.radius),
				planetRotation: [0, 0, 0, 1]
			});
		}
		raf = requestAnimationFrame(frame);
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
		azimuth -= (e.clientX - lastX) * 0.01;
		elevation = Math.max(-1.5, Math.min(1.5, elevation + (e.clientY - lastY) * 0.01));
		lastX = e.clientX;
		lastY = e.clientY;
	}
	function onPointerUp(e: PointerEvent) {
		dragging = false;
		canvas?.releasePointerCapture?.(e.pointerId);
	}
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const params = resolveBodyParams(body);
		distance = Math.max(
			params.radius * 1.05,
			Math.min(params.radius * 60, distance * (1 + Math.sign(e.deltaY) * 0.12))
		);
	}

	onMount(() => {
		const el = canvas;
		if (!el) return;
		let disposed = false;
		distance = resolveBodyParams(body).radius * 3;
		backend = new WebGPUBackend();
		backend.useOffscreen = offscreen;
		backend.onDeviceLost = (reason) => (failed = `device lost: ${reason}`);
		renderer = new PlanetRenderer(backend);
		(async () => {
			try {
				w = el.clientWidth || 1;
				h = el.clientHeight || 1;
				el.width = w;
				el.height = h;
				await renderer.init(el);
				if (disposed) return;
				renderer.resize(w, h);
				ready = true;
			} catch (err) {
				failed = err instanceof Error ? err.message : 'WebGPU unavailable';
			}
		})();
		const ro = new ResizeObserver(() => {
			w = el.clientWidth || 1;
			h = el.clientHeight || 1;
			el.width = w;
			el.height = h;
			if (ready) renderer?.resize(w, h);
		});
		ro.observe(el);
		raf = requestAnimationFrame(frame);
		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			ro.disconnect();
			renderer?.destroy();
		};
	});
</script>

<div class="focused-body">
	<canvas
		bind:this={canvas}
		class="fb-canvas"
		aria-label="Procedural body view"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onwheel={onWheel}
	></canvas>
	<div class="fb-bar">
		<span class="fb-name">{body.name} · procedural</span>
		<label class="fb-toggle">
			<input
				type="checkbox"
				checked={offscreen}
				onchange={(e) => {
					offscreen = e.currentTarget.checked;
					if (backend) backend.useOffscreen = offscreen;
				}}
			/>
			offscreen
		</label>
		<button type="button" onclick={() => onclose?.()}>Close</button>
	</div>
	{#if failed}
		<div class="fb-overlay">Procedural view unavailable: {failed}</div>
	{/if}
</div>

<style>
	.focused-body {
		position: absolute;
		inset: 0;
		z-index: 20;
		background: #04060e;
	}

	.fb-canvas {
		width: 100%;
		height: 100%;
		display: block;
		touch-action: none;
		cursor: grab;
	}

	.fb-canvas:active {
		cursor: grabbing;
	}

	.fb-bar {
		position: absolute;
		top: 12px;
		left: 12px;
		right: 12px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font: 12px/1.2 system-ui, sans-serif;
		color: #e8ecf8;
	}

	.fb-toggle {
		display: flex;
		align-items: center;
		gap: 4px;
		font: 11px/1.2 system-ui, sans-serif;
		color: #e8ecf8;
		opacity: 0.85;
	}

	.fb-bar button {
		font: 11px/1.2 system-ui, sans-serif;
		padding: 4px 10px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(26, 31, 48, 0.9);
		color: inherit;
		cursor: pointer;
	}

	.fb-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		text-align: center;
		font: 12px/1.4 system-ui, sans-serif;
		color: #e8ecf8;
		background: rgba(4, 6, 14, 0.8);
	}
</style>
