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
		Transform
	} from '$lib/planet/scene/types.js';

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
		onRenderProcedural?: () => void;
		onOpenPlanet?: () => void;
		onOpenPlanetNewTab?: () => void;
		onCloseFocused?: () => void;
	}
</script>

<script lang="ts">
	import Subdivide from '@virtual-planet/subdivide/Subdivide.svelte';
	import OutlinerPanel from './OutlinerPanel.svelte';
	import PropertiesPanel from './PropertiesPanel.svelte';
	import RenderSettingsPanel from './RenderSettingsPanel.svelte';
	import ViewportZone from './ViewportZone.svelte';
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
		onRenderProcedural,
		onOpenPlanet,
		onOpenPlanetNewTab,
		onCloseFocused
	}: Props = $props();

	let layout = $state<LayoutDocument>(loadSceneLayout());

	const zoneLabels = {
		outliner: 'Outliner',
		properties: 'Properties',
		renderSettings: 'Render',
		viewport: 'Viewport'
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
		{onCloseFocused}
	/>
{/snippet}

<div class="system-page">
	<Subdivide
		bind:layout
		zones={{ outliner, properties, renderSettings, viewport }}
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
		width: 100vw;
		height: 100vh;
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
