<script module lang="ts">
	import type { LayoutDocument } from '@virtual-planet/subdivide';
	import type { NodeEditor } from '$lib/planet/scene/nodeSchemas.js';
	import type { SceneDebugMode } from '$lib/planet/scene/sceneDebug.js';
	import type { OrbitLookMode } from '$lib/planet/camera/orbitCamera.js';
	import type { SceneViewportPrefs } from '$lib/planet/scene/viewportPrefs.js';
	import type {
		BodyAppearance,
		BodyAtmosphere,
		BodyNode,
		Constraint,
		FieldTerm,
		PlanetScene,
		SceneNode,
		Transform,
		NodeDisplay
	} from '$lib/planet/scene/types.js';
	import type { FlightInputState } from '$lib/planet/flight/controls.js';
	import { createFlightInputState } from '$lib/planet/flight/controls.js';
	import type { FlightRegime } from '$lib/planet/flight/atmosphereFlight.js';
	import {
		createDefaultShipState,
		defaultSpaceflightSettings,
		type OrbitPrediction,
		type ShipState,
		type SpaceflightSettings
	} from '$lib/planet/flight/types.js';

	interface BreadcrumbCrumb {
		id: string;
		name: string;
	}

	interface Props {
		scene: PlanetScene;
		selectedId: string | null;
		selectedNode: SceneNode | null;
		evaluatedNode: SceneNode | null;
		breadcrumb: BreadcrumbCrumb[];
		editor: NodeEditor | null;
		schemaValue: Record<string, unknown>;
		bodyNode: BodyNode | null;
		hasAppearance: boolean;
		driverValue: Record<string, unknown>;
		clock: number;
		playing: boolean;
		speed: number;
		materialDebug: SceneDebugMode;
		lookMode: OrbitLookMode;
		viewportPrefs: SceneViewportPrefs;
		focusedBody: BodyNode | null;
		onSave?: () => void;
		onReset?: () => void;
		onAddGroup?: () => void;
		onAddBody?: () => void;
		onAddOrbit?: () => void;
		onDelete?: () => void;
		onFieldChange?: (next: Record<string, unknown>) => void;
		onTransformChange?: (t: Transform) => void;
		onDriverChange?: (next: Record<string, unknown>) => void;
		onBindingsChange?: (next: FieldTerm[]) => void;
		onConstraintsChange?: (next: Constraint[]) => void;
		onAppearanceChange?: (a: BodyAppearance) => void;
		onAtmosphereChange?: (a: BodyAtmosphere) => void;
		onDisplayChange?: (patch: Partial<NodeDisplay>) => void;
		onRenderProcedural?: () => void;
		onOpenPlanet?: () => void;
		onOpenPlanetNewTab?: () => void;
		onCloseFocused?: () => void;
		shipState?: ShipState;
		spaceflightActive?: boolean;
		spaceflightSettings?: SpaceflightSettings;
		flightInputState?: FlightInputState;
		prediction?: OrbitPrediction;
		flightRegime?: FlightRegime;
		atmoBlend?: number;
		gamepadConnected?: boolean;
		gamepadId?: string;
		onEnterSpaceflight?: () => void;
		onExitSpaceflight?: () => void;
		onPrograde?: () => void;
		onRetrograde?: () => void;
		onReleaseOrientation?: () => void;
		onCircularize?: () => void;
		onKillVelocity?: () => void;
	}
</script>

<script lang="ts">
	import Subdivide from '@virtual-planet/subdivide/Subdivide.svelte';
	import OutlinerPanel from './OutlinerPanel.svelte';
	import PropertiesPanel from './PropertiesPanel.svelte';
	import RenderSettingsPanel from './RenderSettingsPanel.svelte';
	import ViewportZone from './ViewportZone.svelte';
	import FlightPanel from './FlightPanel.svelte';
	import { debounce, loadSceneLayout, saveSceneLayout } from './layoutStorage.js';

	let {
		scene = $bindable(),
		selectedId = $bindable(),
		selectedNode,
		evaluatedNode,
		breadcrumb,
		editor,
		schemaValue,
		bodyNode,
		hasAppearance,
		driverValue,
		clock = $bindable(),
		playing = $bindable(),
		speed = $bindable(),
		materialDebug = $bindable(),
		lookMode = $bindable(),
		viewportPrefs = $bindable(),
		focusedBody,
		onSave,
		onReset,
		onAddGroup,
		onAddBody,
		onAddOrbit,
		onDelete,
		onFieldChange,
		onTransformChange,
		onDriverChange,
		onBindingsChange,
		onConstraintsChange,
		onAppearanceChange,
		onAtmosphereChange,
		onDisplayChange,
		onRenderProcedural,
		onOpenPlanet,
		onOpenPlanetNewTab,
		onCloseFocused,
		shipState = $bindable(createDefaultShipState()),
		spaceflightActive = $bindable(false),
		spaceflightSettings = $bindable(defaultSpaceflightSettings()),
		flightInputState = $bindable(createFlightInputState()),
		prediction = { pathPoints: [], crashed: false, pePoint: null, apPoint: null },
		flightRegime = 'vacuum',
		atmoBlend = 0,
		gamepadConnected = false,
		gamepadId = '',
		onEnterSpaceflight,
		onExitSpaceflight,
		onPrograde,
		onRetrograde,
		onReleaseOrientation,
		onCircularize,
		onKillVelocity
	}: Props = $props();

	let layout = $state<LayoutDocument>(loadSceneLayout());

	const zoneLabels = {
		outliner: 'Outliner',
		properties: 'Properties',
		renderSettings: 'Render',
		viewport: 'Viewport',
		flight: 'Flight'
	};

	const persistLayout = debounce((doc: LayoutDocument) => saveSceneLayout(doc), 300);

	function onLayoutChange(event: { layout: LayoutDocument }) {
		persistLayout(event.layout);
	}
</script>

{#snippet outliner()}
	<OutlinerPanel
		bind:scene
		bind:selectedId
		{onSave}
		{onReset}
		{onAddGroup}
		{onAddBody}
		{onAddOrbit}
		{onDelete}
	/>
{/snippet}

{#snippet properties()}
	<PropertiesPanel
		{scene}
		bind:selectedId
		{selectedNode}
		{evaluatedNode}
		{breadcrumb}
		{editor}
		{schemaValue}
		{bodyNode}
		{hasAppearance}
		{driverValue}
		{onFieldChange}
		{onTransformChange}
		{onDriverChange}
		{onBindingsChange}
		{onConstraintsChange}
		{onAppearanceChange}
		{onAtmosphereChange}
		{onDisplayChange}
		{onRenderProcedural}
		{onOpenPlanet}
		{onOpenPlanetNewTab}
	/>
{/snippet}

{#snippet renderSettings()}
	<RenderSettingsPanel bind:materialDebug bind:lookMode bind:viewportPrefs />
{/snippet}

{#snippet viewport()}
	<ViewportZone
		{scene}
		bind:selectedId
		bind:clock
		bind:playing
		bind:speed
		{materialDebug}
		{lookMode}
		bind:viewportPrefs
		{focusedBody}
		bind:shipState
		bind:spaceflightActive
		bind:spaceflightSettings
		bind:flightInputState
		bind:atmoBlend
		bind:flightRegime
		bind:gamepadConnected
		bind:gamepadId
		onCloseFocused={onCloseFocused}
	/>
{/snippet}

{#snippet flight()}
	<FlightPanel
		{scene}
		{clock}
		bind:shipState
		bind:spaceflightActive
		bind:spaceflightSettings
		bind:flightInputState
		{prediction}
		{flightRegime}
		{atmoBlend}
		{gamepadConnected}
		{gamepadId}
		onEnter={onEnterSpaceflight}
		onExit={onExitSpaceflight}
		onPrograde={onPrograde}
		onRetrograde={onRetrograde}
		onRelease={onReleaseOrientation}
		onCircularize={onCircularize}
		onKillVelocity={onKillVelocity}
	/>
{/snippet}

<div class="system-page">
	<Subdivide
		bind:layout
		zones={{ outliner, properties, renderSettings, viewport, flight }}
		{zoneLabels}
		thickness="2px"
		padding="6px"
		color="rgba(255,255,255,0.12)"
		onlayoutchange={onLayoutChange}
	/>
</div>

<style>
	.system-page {
		position: relative;
		display: flex;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #05070e;
		color: #e8ecf8;
		font: 13px/1.4 system-ui, sans-serif;
	}

	.system-page :global(.clip) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}
</style>
