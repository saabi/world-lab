<script lang="ts">
	import { onMount } from 'svelte';
	import { WebGPUBackend } from '../render/WebGPUBackend.js';
	import { PlanetRenderer } from '../render/planetRenderer.js';
	import { sceneBodyCamera, type OrbitCamera } from '../scene3d/orbitCamera.js';
	import { resolveBodyParams } from '../scene/bodyParams.js';
	import { defaultAtmosphereParams } from '../params/atmosphereParams.js';
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

	interface AtmoDebug {
		enabled: boolean;
		rayleigh: number;
		mie: number;
		fog: number;
	}
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
		/** Live atmosphere debug knobs from the editor (strengths are world-scale). */
		atmo: AtmoDebug;
		/** Material debug view (parity diagnostic), mirrors /planet's dropdown. */
		materialDebug?: MaterialDebugMode;
	}
	let {
		body,
		camera,
		bodyWorldPos,
		planetRotation,
		lighting,
		atmo,
		materialDebug = 'off'
	}: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let w = 1;
	let h = 1;
	let renderer: PlanetRenderer | null = null;
	let ready = false;
	let raf = 0;

	function frame(ts: number) {
		if (renderer && ready && w > 0 && h > 0) {
			// Render at world scale (radius = radiusMeters; terrain is scale-invariant)
			// in the scene camera via floating origin → screen + depth match the spheres.
			const preset = resolveBodyParams(body);
			const params = { ...preset, radius: body.radiusMeters };
			const cam = sceneBodyCamera(
				{ ...camera, target: bodyWorldPos },
				bodyWorldPos,
				body.radiusMeters,
				w / Math.max(h, 1)
			);
			// Atmosphere geometry (shell/scale heights) scales with radius; the strengths
			// are world-scale and tuned live via the editor (the optical depth's radius
			// coupling is non-linear, so expose the knobs rather than guess a factor).
			const atmosphere = {
				...defaultAtmosphereParams(body.radiusMeters, atmo.fog),
				enabled: atmo.enabled,
				rayleighStrength: atmo.rayleigh,
				mieStrength: atmo.mie
			};
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
