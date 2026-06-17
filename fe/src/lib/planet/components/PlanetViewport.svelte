<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { CameraState } from '../camera/cameraModes.js';
	import { blendPatchModes, selectRenderMode } from '../camera/cameraModes.js';
	import { createOrbitCamera } from '../camera/orbitCamera.js';
	import {
		buildLocalFrame,
		maybeRebaseFrame
	} from '../math/localFrame.js';
	import type { PlanetParameters } from '../params/planetParams.js';
	import { DEFAULT_PRESET, PLANET_PRESETS, type PlanetPresetName } from '../params/presets.js';
	import { scheduleOrbitPatches } from '../patches/cubeSphere.js';
	import type { CubeSpherePatch } from '../patches/types.js';
	import { buildSurfacePatchRings } from '../patches/surfaceScheduler.js';
	import type { OrbitScheduleMeta, RenderBackend, RenderFrame, RenderStats } from '../render/RenderBackend.js';
	import { WebGLBackend } from '../render/WebGLBackend.js';
	import { WebGPUBackend } from '../render/WebGPUBackend.js';

	let canvas = $state<HTMLCanvasElement | null>(null);
	let backend = $state<RenderBackend | null>(null);
	let backendLabel = $state('initializing…');
	let initError = $state<string | null>(null);

	let presetName = $state<PlanetPresetName>(DEFAULT_PRESET);
	let params = $derived(PLANET_PRESETS[presetName] as PlanetParameters);

	let wireframe = $state(false);
	let faceColors = $state(false);
	let showPatchBorders = $state(false);
	let showRingColors = $state(false);

	let azimuth = $state(0.6);
	let elevation = $state(0.35);
	let distance = $state(320);

	let stats = $state<RenderStats>({ frameMs: 0, patchCount: 0, vertexCount: 0, mode: 'orbit' });
	let hud = $state({ altitude: 0, mode: 'orbit', rebases: 0, fps: 0 });

	let dragging = false;
	let lastX = 0;
	let lastY = 0;
	let localFrame = buildLocalFrame([0, 0, 320], 100);
	let modeState: CameraState['mode'] = 'orbit';
	let raf = 0;
	let lastFpsTime = 0;
	let frames = 0;
	let canvasWidth = 0;
	let canvasHeight = 0;

	const presetNames = Object.keys(PLANET_PRESETS) as PlanetPresetName[];

	function buildCamera(width: number, height: number, p: PlanetParameters): CameraState {
		const aspect = width / Math.max(height, 1);
		const far = Math.max(p.radius * 20, distance * 4);
		return createOrbitCamera({
			distance,
			azimuth,
			elevation,
			fovDeg: 60,
			aspect,
			near: 0.1,
			far,
			planetRadius: p.radius
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
				focalLengthPx: camera.focalLengthPx
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
			debug: { wireframe, faceColors, showPatchBorders, showRingColors }
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
		azimuth += dx * 0.005;
		elevation = Math.max(-1.4, Math.min(1.4, elevation - dy * 0.005));
	}

	function onPointerUp(e: PointerEvent) {
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		distance = Math.max(params.radius * 1.05, Math.min(params.radius * 50, distance + e.deltaY * 0.2));
	}

	function loop(time: number) {
		if (!canvas || !backend) return;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (width > 0 && height > 0) {
			if (width !== canvasWidth || height !== canvasHeight) {
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
				altitude: camera.altitudeMeters,
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
		}
		raf = requestAnimationFrame(loop);
	}

	onMount(() => {
		if (!browser || !canvas) return;

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
				raf = requestAnimationFrame(loop);
			}
		})();

		return () => {
			cancelAnimationFrame(raf);
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

	<aside class="debug-panel">
		<h2>Virtual Planet</h2>
		<p class="backend">{backendLabel}</p>
		{#if initError}
			<p class="error">{initError}</p>
		{/if}

		<label>
			Preset
			<select bind:value={presetName}>
				{#each presetNames as name}
					<option value={name}>{name}</option>
				{/each}
			</select>
		</label>

		<label><input type="checkbox" bind:checked={wireframe} /> Wireframe</label>
		<label><input type="checkbox" bind:checked={faceColors} /> Face colors</label>
		<label><input type="checkbox" bind:checked={showPatchBorders} /> Patch borders</label>
		<label><input type="checkbox" bind:checked={showRingColors} /> Ring colors</label>

		<div class="stats">
			<div>FPS: {hud.fps}</div>
			<div>Frame: {stats.frameMs.toFixed(1)} ms</div>
			<div>Mode: {hud.mode}</div>
			<div>Altitude: {hud.altitude.toFixed(0)} m</div>
			<div>Patches: {stats.patchCount}{#if stats.candidatePatches != null} / {stats.candidatePatches} cand{/if}</div>
			<div>Vertices: {stats.vertexCount.toLocaleString()}{#if stats.vertexBudget != null} / {stats.vertexBudget.toLocaleString()} budget{/if}</div>
			{#if stats.budgetDropped != null && stats.budgetDropped > 0}
				<div>Budget dropped: {stats.budgetDropped}</div>
			{/if}
			<div>Rebases: {hud.rebases}</div>
			<div>Distance: {distance.toFixed(0)}</div>
		</div>
	</aside>
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

	.debug-panel {
		position: absolute;
		top: 12px;
		left: 12px;
		padding: 12px 14px;
		background: rgba(8, 10, 20, 0.82);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		color: #e8ecf8;
		font: 13px/1.4 system-ui, sans-serif;
		min-width: 180px;
	}

	.debug-panel h2 {
		margin: 0 0 6px;
		font-size: 15px;
		font-weight: 600;
	}

	.backend {
		margin: 0 0 10px;
		opacity: 0.75;
	}

	.error {
		color: #f88;
		margin: 0 0 8px;
	}

	label {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	select {
		flex: 1;
		background: #1a1f30;
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
	}

	.stats {
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		display: grid;
		gap: 2px;
		font-variant-numeric: tabular-nums;
	}
</style>
