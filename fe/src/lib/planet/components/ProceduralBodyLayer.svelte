<script lang="ts">
	import { onMount } from 'svelte';
	import { WebGPUBackend } from '../render/WebGPUBackend.js';
	import { PlanetRenderer } from '../render/planetRenderer.js';
	import { focusedBodyCamera, type OrbitLookMode } from '../camera/orbitCamera.js';
	import type { OrbitCamera } from '../scene3d/orbitCamera.js';
	import { resolveBodyParams } from '../scene/bodyParams.js';
	import { resolveBodyAtmosphere, bodyAtmosphereToParameters } from '../scene/bodyAtmosphere.js';
	import { DEFAULT_TESSELLATION } from '../patches/tessellationSettings.js';
	import { DEFAULT_MATERIAL_OVERRIDES, type MaterialDebugMode } from '../material/biomes.js';
	import type { LightingUniforms } from '../render/uniformLayouts.js';
	import type { Vec3 } from '../math/vec.js';
	import type { BodyNode, Quat } from '../scene/types.js';

	// A procedural render of one body on its own canvas, camera-driven by the host scene
	// (no own controls; pointer-events: none) and stacked over the sphere view with the
	// host setting opacity = proceduralBlend — the planet dissolves in over its sphere.
	// Reuses FocusedBodyView's proven render path. Compositing into the scene's depth
	// (per-pixel occlusion) is the later GPU step; this is the cross-fade. See
	// _docs/specs/scene-procedural-rendering.md.

	interface Props {
		body: BodyNode;
		/** The scene orbit camera (azimuth/elevation/distance); the body is the target. */
		camera: OrbitCamera;
		/** The body's world position, so it renders in world coords / floating origin. */
		bodyWorldPos: Vec3;
		/** Evaluated body-space rotation: spin/tilt for procedural terrain sampling. */
		planetRotation: Quat;
		/** Packed scene lighting (sun toward Sol, in the body frame) from the host. */
		lighting: LightingUniforms;
		/** Material debug view (parity diagnostic), mirrors /planet's dropdown. */
		materialDebug?: MaterialDebugMode;
		/** Look mode (viewport state, not body data); default targets the body. */
		lookMode?: OrbitLookMode;
		/** Host scene's GPU device — adopt it so this shares the scene's device (Phase 5). */
		sharedDevice?: GPUDevice | null;
	}
	let {
		body,
		camera,
		bodyWorldPos,
		planetRotation,
		lighting,
		materialDebug = 'off',
		lookMode = 'planet-center',
		sharedDevice = null
	}: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let w = 1;
	let h = 1;
	let renderer: PlanetRenderer | null = null;
	let ready = false;
	let raf = 0;

	function frame(ts: number) {
		if (renderer && ready && w > 0 && h > 0) {
			// Render at world scale (radius = radiusMeters; terrain is scale-invariant).
			const preset = resolveBodyParams(body);
			const params = { ...preset, radius: body.radiusMeters };
			// Shared focused-body camera (plan Phase 1): the body sits at the local origin,
			// orbited by the scene camera's azimuth/elevation/distance — the same builder
			// /planet uses, so the two render this body with identical camera math.
			// bodyWorldPos drives the Phase-5 shared-depth composite, not this isolated
			// canvas (where targeting the body makes the world offset an identity).
			const cam = focusedBodyCamera({
				azimuth: camera.azimuth,
				elevation: camera.elevation,
				distance: camera.distance,
				planetRadius: body.radiusMeters,
				aspect: w / Math.max(h, 1),
				lookMode
			});
			// Atmosphere is body data now (resolveBodyAtmosphere → defaults from radiusMeters
			// when unset); strengths are radius-invariant after Phase 3, so they render the
			// same here as in /planet.
			const atmosphere = bodyAtmosphereToParameters(resolveBodyAtmosphere(body));
			renderer.render({
				time: ts * 0.001,
				camera: cam,
				width: w,
				height: h,
				params,
				tessellation: DEFAULT_TESSELLATION,
				debug: { wireframe: false, faceColors: false, showPatchBorders: false, showRingColors: false },
				lighting,
				materialOverrides: { ...DEFAULT_MATERIAL_OVERRIDES, materialDebug },
				atmosphere,
				planetRotation
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
				await renderer.init(el, sharedDevice ?? undefined);
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
