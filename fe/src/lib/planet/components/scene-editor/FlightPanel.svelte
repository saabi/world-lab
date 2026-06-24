<script module lang="ts">
	import type { PlanetScene } from '$lib/planet/scene/types.js';
	import type { FlightInputState } from '$lib/planet/flight/controls.js';
	import type { OrbitPrediction, RcsAxisMode, ShipState, SpaceflightSettings } from '$lib/planet/flight/types.js';
	import type { FlightRegime } from '$lib/planet/flight/atmosphereFlight.js';

	interface Props {
		scene: PlanetScene;
		clock: number;
		shipState: ShipState;
		spaceflightActive: boolean;
		spaceflightSettings: SpaceflightSettings;
		flightInputState: FlightInputState;
		prediction: OrbitPrediction;
		flightRegime: FlightRegime;
		atmoBlend: number;
		gamepadConnected: boolean;
		gamepadId: string;
		onEnter?: () => void;
		onExit?: () => void;
		onPrograde?: () => void;
		onRetrograde?: () => void;
		onRelease?: () => void;
		onCircularize?: () => void;
		onKillVelocity?: () => void;
		onToggleRcsMode?: () => void;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { evaluateScene } from '$lib/planet/scene/driver.js';
	import { listBodies } from '$lib/planet/scene/sceneTree.js';
	import { len3, sub3, type Vec3 } from '$lib/planet/math/vec.js';
	import { gravityMagnitudeAt, radialSpeed } from '$lib/planet/flight/gravity.js';
	import { pickDominantBody } from '$lib/planet/flight/dominantBody.js';
	import { drawOrbitMonitor } from '$lib/planet/flight/orbitMonitor.js';
	import { toggleRcsMode } from '$lib/planet/flight/controls.js';
	import { atmosphereDensity, altitudeAboveSurface } from '$lib/planet/flight/atmosphereDensity.js';
	import { resolveBodyAtmosphere } from '$lib/planet/scene/bodyAtmosphere.js';
	import EditorAccordionSection from './EditorAccordionSection.svelte';

	let {
		scene,
		clock,
		shipState = $bindable(),
		spaceflightActive = $bindable(false),
		spaceflightSettings = $bindable(),
		flightInputState = $bindable(),
		prediction,
		flightRegime,
		atmoBlend,
		gamepadConnected,
		gamepadId,
		onEnter,
		onExit,
		onPrograde,
		onRetrograde,
		onRelease,
		onCircularize,
		onKillVelocity,
		onToggleRcsMode
	}: Props = $props();

	let monitorCanvas = $state<HTMLCanvasElement | null>(null);

	const animated = $derived(evaluateScene(scene, clock));
	const bodies = $derived(listBodies(animated));
	const dominant = $derived(
		spaceflightActive
			? pickDominantBody(
					animated,
					shipState.position,
					spaceflightSettings.targetBodyId,
					spaceflightSettings.gravityG
				)
			: null
	);

	const relPos = $derived(
		dominant
			? (sub3(shipState.position, dominant.center) as Vec3)
			: ([0, 0, 0] as Vec3)
	);
	const orbitalSpeed = $derived(len3(shipState.velocity));
	const radialSpd = $derived(dominant ? radialSpeed(shipState.velocity, relPos) : 0);
	const gravityAcc = $derived(dominant ? gravityMagnitudeAt(relPos, dominant) : 0);
	const omegaMag = $derived(len3(shipState.angularVelocity));

	const atmoStats = $derived.by(() => {
		if (!dominant || !spaceflightActive) return null;
		const node = animated.nodes.get(dominant.bodyId);
		if (!node || node.kind !== 'body') return null;
		const atmo = resolveBodyAtmosphere(node);
		const alt = altitudeAboveSurface(relPos, dominant.radiusMeters);
		const rho = atmosphereDensity(alt, atmo);
		const q = 0.5 * rho * orbitalSpeed * orbitalSpeed;
		return { alt, rho, q };
	});

	const rcsMode = $derived(flightInputState.rcsMode);

	function handleToggleRcs() {
		flightInputState = {
			...flightInputState,
			rcsMode: toggleRcsMode(flightInputState.rcsMode)
		};
		onToggleRcsMode?.();
	}

	function drawMonitor() {
		if (!monitorCanvas || !dominant || !spaceflightActive) return;
		const ctx = monitorCanvas.getContext('2d');
		if (!ctx) return;
		const size = 180;
		if (monitorCanvas.width !== size) monitorCanvas.width = size;
		if (monitorCanvas.height !== size) monitorCanvas.height = size;
		drawOrbitMonitor(ctx, {
			relPosition: relPos,
			velocity: shipState.velocity,
			bodyRadius: dominant.radiusMeters,
			prediction,
			size
		});
	}

	$effect(() => {
		void shipState;
		void prediction;
		void spaceflightActive;
		drawMonitor();
	});

	onMount(() => {
		drawMonitor();
	});
</script>

<div class="flight-panel">
	<header class="flight-header">
		<h2>Flight</h2>
		{#if spaceflightActive}
			<span class="badge active">SPACEFLIGHT</span>
			<span class="badge mode">{rcsMode === 'translate' ? 'Translate' : 'Rotate'} RCS</span>
			{#if flightRegime !== 'vacuum'}
				<span class="badge atmo">{flightRegime}</span>
			{/if}
		{/if}
	</header>

	<div class="flight-actions">
		{#if !spaceflightActive}
			<button type="button" class="primary" onclick={() => onEnter?.()}>Enter spaceflight</button>
		{:else}
			<button type="button" onclick={() => onExit?.()}>Exit</button>
			<button type="button" onclick={handleToggleRcs}>RCS: {rcsMode}</button>
		{/if}
	</div>

	{#if spaceflightActive}
		<div class="stats-grid">
			<div><span class="label">Speed</span><span>{orbitalSpeed.toExponential(3)} m/s</span></div>
			<div><span class="label">Radial</span><span>{radialSpd.toExponential(3)} m/s</span></div>
			<div><span class="label">|ω|</span><span>{omegaMag.toFixed(3)} rad/s</span></div>
			<div><span class="label">Gravity</span><span>{gravityAcc.toFixed(3)} m/s²</span></div>
			{#if atmoStats}
				<div><span class="label">Alt AGL</span><span>{(atmoStats.alt / 1000).toFixed(1)} km</span></div>
				<div><span class="label">ρ</span><span>{atmoStats.rho.toExponential(2)}</span></div>
				<div><span class="label">q</span><span>{atmoStats.q.toExponential(2)}</span></div>
				<div><span class="label">Atmo blend</span><span>{(atmoBlend * 100).toFixed(0)}%</span></div>
			{/if}
		</div>

		<div class="flight-row">
			<div class="monitor-wrap">
				<canvas bind:this={monitorCanvas} class="orbit-monitor" width="180" height="180"></canvas>
			</div>
			<div class="side-controls">
				<label class="field">
					Target body
					<select
						value={spaceflightSettings.targetBodyId ?? ''}
						onchange={(e) => {
							const v = e.currentTarget.value;
							spaceflightSettings = {
								...spaceflightSettings,
								targetBodyId: v || null
							};
						}}
					>
						<option value="">Auto (nearest)</option>
						{#each bodies as b (b.id)}
							<option value={b.id}>{b.name}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					Thrust ×
					<input
						type="range"
						min="0.1"
						max="5"
						step="0.1"
						bind:value={spaceflightSettings.thrustMultiplier}
					/>
					{spaceflightSettings.thrustMultiplier.toFixed(1)}
				</label>
				<div class="autopilot">
					<button type="button" onclick={() => onPrograde?.()}>Prograde</button>
					<button type="button" onclick={() => onRetrograde?.()}>Retrograde</button>
					<button type="button" onclick={() => onRelease?.()}>Release</button>
					<button type="button" onclick={() => onCircularize?.()}>Circularize</button>
					<button type="button" onclick={() => onKillVelocity?.()}>Kill vel</button>
				</div>
			</div>
		</div>

		<EditorAccordionSection title="Controls" open={true}>
			<p class="gamepad-status">
				Gamepad: {gamepadConnected ? gamepadId || 'Connected' : 'None'}
			</p>
			{#if rcsMode === 'translate'}
				<ul class="cheat">
					<li><kbd>W/S</kbd> forward / back · <kbd>A/D</kbd> strafe</li>
					<li><kbd>Space/Ctrl</kbd> up / down</li>
					<li><kbd>R</kbd> or L3 · toggle rotate mode</li>
					<li><kbd>Shift</kbd> or RT · boost</li>
				</ul>
			{:else}
				<ul class="cheat">
					<li><kbd>W/S</kbd> pitch · <kbd>A/D</kbd> yaw</li>
					<li><kbd>Q/E</kbd> roll</li>
					<li><kbd>R</kbd> or L3 · toggle translate mode</li>
					<li>Mouse · fine trim (pointer lock)</li>
				</ul>
			{/if}
		</EditorAccordionSection>
	{/if}
</div>

<style>
	.flight-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 8px;
		height: 100%;
		overflow: auto;
		box-sizing: border-box;
		font: 12px/1.4 system-ui, sans-serif;
		color: #e8ecf8;
	}

	.flight-header {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.flight-header h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}

	.badge {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.badge.active {
		background: rgba(0, 240, 255, 0.2);
		color: #00f0ff;
	}

	.badge.atmo {
		background: rgba(255, 140, 0, 0.2);
		color: #ffb347;
	}

	.flight-actions {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	button {
		font: inherit;
		padding: 4px 10px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(255, 255, 255, 0.06);
		color: inherit;
		cursor: pointer;
	}

	button.primary {
		background: rgba(0, 240, 255, 0.15);
		border-color: rgba(0, 240, 255, 0.4);
	}

	button:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
	}

	.stats-grid .label {
		display: block;
		opacity: 0.55;
		font-size: 10px;
	}

	.flight-row {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}

	.orbit-monitor {
		display: block;
		border-radius: 8px;
		background: rgba(0, 10, 30, 0.8);
		border: 1px solid rgba(0, 240, 255, 0.2);
	}

	.side-controls {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11px;
	}

	select {
		font: inherit;
		background: rgba(0, 0, 0, 0.3);
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 4px;
	}

	.autopilot {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.gamepad-status {
		margin: 0 0 6px;
		opacity: 0.75;
		font-size: 11px;
	}

	.cheat {
		margin: 0;
		padding-left: 18px;
		font-size: 11px;
		opacity: 0.85;
	}

	kbd {
		font-family: ui-monospace, monospace;
		font-size: 10px;
		padding: 1px 4px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.1);
	}
</style>
