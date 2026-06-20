<script lang="ts">
	import { onMount } from 'svelte';
	import { WebGPUBackend } from '../render/WebGPUBackend.js';
	import { PlanetRenderer } from '../render/planetRenderer.js';
	import { createOrbitCamera } from '../camera/orbitCamera.js';
	import { FOVY } from '../scene3d/orbitCamera.js';
	import { resolveBodyParams } from '../scene/bodyParams.js';
	import { defaultAtmosphereParams } from '../params/atmosphereParams.js';
	import { DEFAULT_TESSELLATION } from '../patches/tessellationSettings.js';
	import { DEFAULT_MATERIAL_OVERRIDES } from '../material/biomes.js';
	import { collectSceneLighting } from '../scene/collectLights.js';
	import { packSceneLighting } from '../scene/packLighting.js';
	import { createDefaultPlanetScene } from '../scene/defaults.js';
	import type { LightingUniforms } from '../render/uniformLayouts.js';
	import type { BodyNode } from '../scene/types.js';

	// A procedural render of one body on its own canvas, camera-driven by the host scene
	// (no own controls; pointer-events: none) and stacked over the sphere view with the
	// host setting opacity = proceduralBlend — the planet dissolves in over its sphere.
	// Reuses FocusedBodyView's proven render path. Compositing into the scene's depth
	// (per-pixel occlusion) is the later GPU step; this is the cross-fade. See
	// _docs/specs/scene-procedural-rendering.md.

	interface Props {
		body: BodyNode;
		azimuth: number;
		elevation: number;
		/** Camera distance in the body's render-space units (matched to the scene by the host). */
		distance: number;
	}
	let { body, azimuth, elevation, distance }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let w = 1;
	let h = 1;
	let renderer: PlanetRenderer | null = null;
	let ready = false;
	let raf = 0;
	const lighting: LightingUniforms = packSceneLighting(
		collectSceneLighting(createDefaultPlanetScene(), true)
	);

	function frame(ts: number) {
		if (renderer && ready && w > 0 && h > 0) {
			const params = resolveBodyParams(body);
			const camera = createOrbitCamera({
				distance: Math.max(params.radius * 1.02, distance),
				azimuth,
				elevation,
				fovDeg: (FOVY * 180) / Math.PI, // match the scene camera's fov
				aspect: w / Math.max(h, 1),
				near: Math.max(0.01, params.radius * 0.001),
				far: params.radius * 40,
				planetRadius: params.radius
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

	onMount(() => {
		const el = canvas;
		if (!el) return;
		let disposed = false;
		const backend = new WebGPUBackend();
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
			} catch {
				/* WebGPU unavailable — the host's sphere view stays */
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

<canvas bind:this={canvas} class="proc-layer"></canvas>

<style>
	.proc-layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		pointer-events: none;
	}
</style>
