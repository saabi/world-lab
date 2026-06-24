<script module lang="ts">
	import type { SceneDebugMode } from '$lib/planet/scene/sceneDebug.js';
	import type { OrbitLookMode } from '$lib/planet/camera/orbitCamera.js';
	import type { SceneViewportPrefs } from '$lib/planet/scene/viewportPrefs.js';
	import type { BodyNode, PlanetScene } from '$lib/planet/scene/types.js';
	import type { FlightInputState } from '$lib/planet/flight/controls.js';
	import type { ShipState, SpaceflightSettings } from '$lib/planet/flight/types.js';
	import type { FlightRegime } from '$lib/planet/flight/atmosphereFlight.js';

	interface Props {
		scene: PlanetScene;
		selectedId: string | null;
		clock: number;
		playing: boolean;
		speed: number;
		materialDebug: SceneDebugMode;
		lookMode: OrbitLookMode;
		viewportPrefs: SceneViewportPrefs;
		focusedBody: BodyNode | null;
		shipState?: ShipState;
		spaceflightActive?: boolean;
		spaceflightSettings?: SpaceflightSettings;
		flightInputState?: FlightInputState;
		atmoBlend?: number;
		flightRegime?: FlightRegime;
		gamepadConnected?: boolean;
		gamepadId?: string;
		onCloseFocused?: () => void;
	}
</script>

<script lang="ts">
	import SceneViewport3D from '$lib/planet/components/SceneViewport3D.svelte';
	import SystemMapPanel from '$lib/planet/components/SystemMapPanel.svelte';
	import FocusedBodyView from '$lib/planet/components/FocusedBodyView.svelte';
	import { isSceneAtmosphereDebugMode } from '$lib/planet/scene/sceneDebug.js';

	let {
		scene,
		selectedId = $bindable(),
		clock = $bindable(),
		playing = $bindable(),
		speed = $bindable(),
		materialDebug,
		lookMode,
		viewportPrefs = $bindable(),
		focusedBody,
		shipState = $bindable(),
		spaceflightActive = $bindable(false),
		spaceflightSettings = $bindable(),
		flightInputState = $bindable(),
		atmoBlend = $bindable(0),
		flightRegime = $bindable('vacuum' as FlightRegime),
		gamepadConnected = $bindable(false),
		gamepadId = $bindable(''),
		onCloseFocused
	}: Props = $props();
	let atmosphereDebugActive = $derived(isSceneAtmosphereDebugMode(materialDebug));
</script>

<div class="viewport-zone">
	<SceneViewport3D
		{scene}
		bind:selectedId
		bind:time={clock}
		{materialDebug}
		{lookMode}
		bind:viewportPrefs
		bind:shipState
		bind:spaceflightActive
		bind:spaceflightSettings
		bind:flightInputState
		bind:atmoBlend
		bind:flightRegime
		bind:gamepadConnected
		bind:gamepadId
	/>
	{#if !atmosphereDebugActive && !spaceflightActive}
		<div class="map-inset">
			<SystemMapPanel {scene} bind:selectedId time={clock} bind:playing bind:speed />
		</div>
	{/if}
	{#if focusedBody}
		<FocusedBodyView body={focusedBody} onclose={onCloseFocused} />
	{/if}
</div>

<style>
	.viewport-zone {
		position: relative;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		box-sizing: border-box;
		padding: 12px;
	}

	.map-inset {
		position: absolute;
		right: 18px;
		bottom: 18px;
		width: 300px;
		max-width: 40%;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
		border-radius: 8px;
	}

	.map-inset :global(.map-canvas) {
		height: 180px;
	}
</style>
