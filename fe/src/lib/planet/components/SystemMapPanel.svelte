<script lang="ts">
	import { onMount } from 'svelte';
	import type { Vec3 } from '../math/vec.js';
	import { getChildren, getWorldTransform, listBodies } from '../scene/sceneTree.js';
	import { advanceScene } from '../scene/orbit.js';
	import {
		fitView,
		pickNearest,
		projectToScreen,
		xzBounds,
		type MapView,
		type ScreenPoint
	} from '../scene/systemMap.js';
	import type { BodyNode, PlanetScene } from '../scene/types.js';

	interface Props {
		scene: PlanetScene;
		/** Shared with the scene tree: the selected node id. */
		selectedId?: string | null;
	}

	let { scene, selectedId = $bindable(null) }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let time = $state(0);
	let playing = $state(true);
	let speed = $state(1);
	/** Body the map follows/zooms to; null = fit the whole system. */
	let followId = $state<string | null>(null);
	let canvasW = $state(1);
	let canvasH = $state(1);

	let screenPoints: ScreenPoint[] = [];
	let raf = 0;
	let lastTs = 0;

	const BODY_STYLE: Record<BodyNode['bodyType'], { r: number; color: string }> = {
		star: { r: 6, color: '#ffd27f' },
		gas_giant: { r: 5, color: '#caa46a' },
		planet: { r: 4, color: '#6b9fff' },
		moon: { r: 2.5, color: '#9aa4b8' }
	};

	interface OrbitCircle {
		bodyId: string | null;
		cx: number;
		cz: number;
		radius: number;
	}

	const radiusOf = (pos: Vec3) => Math.hypot(pos[0], pos[2]);

	/** Each orbit (phase→radius→body) as a circle: center = phase node's world pos,
	 *  radius = the radius node's offset. */
	function orbitCircles(animated: PlanetScene): OrbitCircle[] {
		const out: OrbitCircle[] = [];
		for (const node of animated.nodes.values()) {
			if (!node.orbitPhase) continue;
			const radiusNode = getChildren(animated, node.id).find((c) => c.kind === 'group');
			if (!radiusNode) continue;
			const center = getWorldTransform(animated, node.id).position;
			const body = getChildren(animated, radiusNode.id).find((c) => c.kind === 'body');
			out.push({
				bodyId: body?.id ?? null,
				cx: center[0],
				cz: center[2],
				radius: radiusOf(radiusNode.transform.position)
			});
		}
		return out;
	}

	/** Zoom span (world meters) when following a body: frame its moons, or itself. */
	function followSpan(animated: PlanetScene, body: BodyNode): number {
		let span = 0;
		if (body.parentId != null) {
			// Moons orbit the body's system center (the body's parent = its radius node).
			for (const child of getChildren(animated, body.parentId)) {
				if (!child.orbitPhase) continue;
				const radiusNode = getChildren(animated, child.id).find((c) => c.kind === 'group');
				if (radiusNode) span = Math.max(span, radiusOf(radiusNode.transform.position));
			}
		}
		return Math.max(span * 1.3, body.radiusMeters * 8, 1);
	}

	function fitAllView(animated: PlanetScene, bodies: BodyNode[], circles: OrbitCircle[]): MapView {
		const pts: Vec3[] = [];
		for (const b of bodies) pts.push(getWorldTransform(animated, b.id).position);
		for (const c of circles) {
			pts.push([c.cx + c.radius, 0, c.cz], [c.cx - c.radius, 0, c.cz]);
			pts.push([c.cx, 0, c.cz + c.radius], [c.cx, 0, c.cz - c.radius]);
		}
		return fitView(xzBounds(pts), canvasW, canvasH, 28);
	}

	function draw() {
		const el = canvas;
		if (!el) return;
		const ctx = el.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, canvasW, canvasH);

		const animated = advanceScene(scene, time);
		const bodies = listBodies(animated);
		if (bodies.length === 0) {
			ctx.fillStyle = 'rgba(232,236,248,0.5)';
			ctx.font = '12px system-ui';
			ctx.textAlign = 'center';
			ctx.fillText('No bodies — load the Toy Solar System', canvasW / 2, canvasH / 2);
			ctx.textAlign = 'left';
			screenPoints = [];
			return;
		}

		const worldPos = new Map<string, Vec3>();
		for (const b of bodies) worldPos.set(b.id, getWorldTransform(animated, b.id).position);
		const circles = orbitCircles(animated);

		let view: MapView;
		const followBody = followId ? (animated.nodes.get(followId) as BodyNode | undefined) : undefined;
		if (followBody && followBody.kind === 'body') {
			const c = worldPos.get(followBody.id)!;
			const span = followSpan(animated, followBody);
			view = {
				scale: Math.min(canvasW, canvasH) / (2 * span * 1.2),
				worldCenterX: c[0],
				worldCenterZ: c[2],
				width: canvasW,
				height: canvasH
			};
		} else {
			view = fitAllView(animated, bodies, circles);
		}

		// Orbit circles (center = phase node world pos, radius = the radius offset).
		ctx.lineWidth = 1;
		for (const c of circles) {
			const [px, py] = projectToScreen(view, c.cx, c.cz);
			ctx.strokeStyle =
				c.bodyId && c.bodyId === selectedId ? 'rgba(158,192,255,0.5)' : 'rgba(255,255,255,0.1)';
			ctx.beginPath();
			ctx.arc(px, py, c.radius * view.scale, 0, Math.PI * 2);
			ctx.stroke();
		}

		// Bodies + labels.
		screenPoints = [];
		for (const b of bodies) {
			const wp = worldPos.get(b.id)!;
			const [px, py] = projectToScreen(view, wp[0], wp[2]);
			screenPoints.push({ id: b.id, x: px, y: py });
			const st = BODY_STYLE[b.bodyType];
			// Dot reflects the body's true radius, clamped so it's always visible at
			// fit-all and scales up (showing radius edits) when zoomed in.
			const r = Math.max(st.r, Math.min(b.radiusMeters * view.scale, 60));
			if (b.bodyType === 'star') {
				ctx.beginPath();
				ctx.arc(px, py, r + 4, 0, Math.PI * 2);
				ctx.fillStyle = 'rgba(255,210,127,0.2)';
				ctx.fill();
			}
			ctx.beginPath();
			ctx.arc(px, py, r, 0, Math.PI * 2);
			ctx.fillStyle = st.color;
			ctx.fill();
			if (b.id === selectedId) {
				ctx.beginPath();
				ctx.arc(px, py, r + 4, 0, Math.PI * 2);
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 1.5;
				ctx.stroke();
			}
			ctx.fillStyle = 'rgba(232,236,248,0.75)';
			ctx.font = '10px system-ui, sans-serif';
			ctx.fillText(b.name, px + r + 3, py + 3);
		}
	}

	function loop(ts: number) {
		if (lastTs) time += ((ts - lastTs) / 1000) * speed;
		lastTs = ts;
		draw();
		raf = playing ? requestAnimationFrame(loop) : 0;
	}

	function startLoop() {
		if (raf || !playing) return;
		lastTs = 0;
		raf = requestAnimationFrame(loop);
	}

	function stopLoop() {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	}

	function togglePlay() {
		playing = !playing;
		if (playing) startLoop();
		else stopLoop();
	}

	function onPointerDown(e: PointerEvent) {
		const el = canvas;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const px = (e.clientX - rect.left) * (canvasW / rect.width);
		const py = (e.clientY - rect.top) * (canvasH / rect.height);
		const id = pickNearest(screenPoints, px, py, 14);
		if (id) {
			selectedId = id;
			followId = id; // zoom to / follow the object
		} else {
			followId = null; // click empty space → fit the whole system
		}
		if (!playing) draw();
	}

	// Redraw when paused and inputs change (scene/selection/size). While playing the
	// loop already redraws every frame.
	$effect(() => {
		void scene;
		void selectedId;
		void followId;
		void canvasW;
		void canvasH;
		if (!playing) draw();
	});

	onMount(() => {
		const el = canvas;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			canvasW = el.clientWidth || 1;
			canvasH = el.clientHeight || 1;
			el.width = canvasW;
			el.height = canvasH;
			if (!playing) draw();
		});
		ro.observe(el);
		canvasW = el.clientWidth || 1;
		canvasH = el.clientHeight || 1;
		el.width = canvasW;
		el.height = canvasH;
		startLoop();
		return () => {
			stopLoop();
			ro.disconnect();
		};
	});
</script>

<section class="system-map" aria-label="System map">
	<div class="map-controls">
		<button type="button" onclick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
		<label class="speed">
			Speed
			<select bind:value={speed}>
				<option value={1}>1×</option>
				<option value={4}>4×</option>
				<option value={16}>16×</option>
			</select>
		</label>
		<button type="button" onclick={() => (followId = null)} disabled={followId === null}>
			Fit all
		</button>
	</div>
	<canvas bind:this={canvas} class="map-canvas" onpointerdown={onPointerDown}></canvas>
</section>

<style>
	.system-map {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		background: rgba(8, 10, 20, 0.88);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		color: #e8ecf8;
	}

	.map-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		font: 11px/1.2 system-ui, sans-serif;
	}

	.map-controls button {
		font: 11px/1.2 system-ui, sans-serif;
		padding: 3px 8px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
	}

	.map-controls button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.speed {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
	}

	.speed select {
		background: #1a1f30;
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 1px 4px;
	}

	.map-canvas {
		width: 100%;
		height: 240px;
		display: block;
		background: radial-gradient(circle at 50% 50%, rgba(20, 26, 48, 0.6), rgba(4, 6, 14, 0.9));
		border-radius: 6px;
		cursor: pointer;
		touch-action: none;
	}
</style>
