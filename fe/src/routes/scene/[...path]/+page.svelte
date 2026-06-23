<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createToySolarSystemScene } from '$lib/planet/scene/solarSystem.js';
	import { getNode } from '$lib/planet/scene/sceneTree.js';
	import { pathNodeIds, pathOf, resolvePath } from '$lib/planet/scene/scenePath.js';
	import { deserializeScene, serializeScene } from '$lib/planet/scene/sceneDocument.js';
	import { resolveBodyParams } from '$lib/planet/scene/bodyParams.js';
	import { writeHandoffLink } from '$lib/planet/scene/planetHandoff.js';
	import { toSnapshot } from '$lib/planet/documents/snapshot.js';
	import { writeSession } from '$lib/planet/documents/storage.js';
	import { CURRENT_SNAPSHOT_VERSION } from '$lib/planet/documents/types.js';
	import { DEFAULT_PRESET } from '$lib/planet/params/presets.js';
	import {
		addChild,
		addOrbitingBody,
		makeBody,
		makeGroup,
		removeSubtree
	} from '$lib/planet/scene/sceneEdit.js';
	import { editorForKind } from '$lib/planet/scene/nodeSchemas.js';
	import { evaluateScene } from '$lib/planet/scene/driver.js';
	import { fields } from '@virtual-planet/schema';
	import SceneEditorShell from '$lib/planet/components/scene-editor/SceneEditorShell.svelte';
	import { createDefaultViewportPrefs } from '$lib/planet/scene/viewportPrefs.js';
	import type { SceneDebugMode } from '$lib/planet/scene/sceneDebug.js';
	import type { OrbitLookMode } from '$lib/planet/camera/orbitCamera.js';
	import {
		resolveBodyAtmosphere,
		bodyAtmosphereToParameters
	} from '$lib/planet/scene/bodyAtmosphere.js';
	import type {
		BodyAppearance,
		BodyAtmosphere,
		Constraint,
		FieldTerm,
		PlanetScene,
		Transform
	} from '$lib/planet/scene/types.js';

	const SCENE_KEY = 'vp.systemScene';

	function loadScene(): PlanetScene {
		if (browser) {
			try {
				const saved = localStorage.getItem(SCENE_KEY);
				if (saved) return deserializeScene(saved) ?? createToySolarSystemScene();
			} catch {
				/* private mode / quota — fall through to default */
			}
		}
		return createToySolarSystemScene();
	}

	let scene = $state(loadScene());
	let selectedId = $state<string | null>(null);

	// URL → selection: re-resolve when the URL path changes (untrack selectedId so a
	// click that changes the selection here does not re-run + revert this effect).
	$effect(() => {
		const seg = page.params.path ?? '';
		const id = seg ? resolvePath(scene, scene.rootId, '/' + seg) : null;
		untrack(() => {
			if (id !== selectedId) selectedId = id;
		});
	});

	// Selection → URL: navigate when the selection changes (untrack page so this fires
	// on selectedId only, not when the URL it just set comes back around).
	$effect(() => {
		if (!browser) return;
		const id = selectedId;
		untrack(() => {
			const segs = id ? (pathOf(scene, id) ?? []) : [];
			const url = '/scene' + (segs.length ? '/' + segs.join('/') : '');
			if (page.url.pathname !== url) goto(url, { keepFocus: true, noScroll: true });
		});
	});

	function saveScene() {
		if (!browser) return;
		try {
			localStorage.setItem(SCENE_KEY, serializeScene(scene));
		} catch {
			/* ignore */
		}
	}

	function resetScene() {
		if (browser) {
			try {
				localStorage.removeItem(SCENE_KEY);
			} catch {
				/* ignore */
			}
		}
		scene = createToySolarSystemScene();
		selectedId = null;
	}

	const selectedNode = $derived(selectedId ? (getNode(scene, selectedId) ?? null) : null);
	/** Narrowed to a body for the appearance editor (planet/moon only). */
	const bodyNode = $derived(
		selectedNode && selectedNode.kind === 'body' ? selectedNode : null
	);
	const hasAppearance = $derived(
		bodyNode?.bodyType === 'planet' || bodyNode?.bodyType === 'moon'
	);

	// Focused procedural body (full-screen overlay via the /planet pipeline).
	let focusedBodyId = $state<string | null>(null);
	const focusedBody = $derived.by(() => {
		if (!focusedBodyId) return null;
		const n = getNode(scene, focusedBodyId);
		return n && n.kind === 'body' ? n : null;
	});

	// Shared animation clock (driven by the map's loop) so the editor's live values
	// match the animation. The selected node, evaluated at the current time, gives the
	// driven-channel values the TransformEditor displays.
	let clock = $state(0);
	// The single animation-clock advancer (shared by every viewport panel). One loop here,
	// not one per SystemMapPanel, so subdividing the layout into multiple viewports does not
	// multiply the clock rate; play/pause/speed are shared state bound into all panels.
	let playing = $state(true);
	let speed = $state(1);
	$effect(() => {
		if (!browser || !playing) return;
		let last = 0;
		let raf = requestAnimationFrame(function tick(ts: number) {
			if (last) clock += ((ts - last) / 1000) * speed;
			last = ts;
			raf = requestAnimationFrame(tick);
		});
		return () => cancelAnimationFrame(raf);
	});
	// Material debug view for the procedural body — parity diagnostic mirroring /planet's
	// dropdown (e.g. body-dir / lat-long grid to spot tessellation-dependent sampling).
	let materialDebug = $state<SceneDebugMode>('off');
	// Focused-body look mode — viewport state (not body data). planet-center targets the
	// body; horizon aims along travel for low-orbit views, matching /planet's toggle.
	let lookMode = $state<OrbitLookMode>('planet-center');
	let viewportPrefs = $state(createDefaultViewportPrefs());
	const evaluatedNode = $derived.by(() => {
		if (!selectedNode) return null;
		return evaluateScene(scene, clock).nodes.get(selectedNode.id) ?? selectedNode;
	});
	const breadcrumb = $derived(
		selectedId
			? (pathNodeIds(scene, selectedId) ?? []).map((nid) => ({
					id: nid,
					name: getNode(scene, nid)?.name ?? nid
				}))
			: []
	);
	const editor = $derived(selectedNode ? editorForKind(selectedNode.kind) : null);
	const schemaValue = $derived.by(() => {
		if (!selectedNode || editor?.mode !== 'schema') return {};
		const node = selectedNode as unknown as Record<string, unknown>;
		const v: Record<string, unknown> = {};
		for (const f of fields(editor.schema)) v[f.key] = node[f.key];
		return v;
	});

	function updateNode(s: PlanetScene, id: string, changes: Record<string, unknown>): PlanetScene {
		const node = s.nodes.get(id);
		if (!node) return s;
		const nodes = new Map(s.nodes);
		nodes.set(id, { ...node, ...changes });
		return { rootId: s.rootId, nodes };
	}

	function onFieldChange(next: Record<string, unknown>) {
		if (selectedId) scene = updateNode(scene, selectedId, next);
	}

	function onTransformChange(t: Transform) {
		if (selectedId) scene = updateNode(scene, selectedId, { transform: t });
	}

	// Driver params (kepler etc.), edited via a schema form; `type` is preserved.
	const driverValue = $derived.by(() => {
		if (!selectedNode?.driver) return {};
		const { type: _type, ...params } = selectedNode.driver;
		return params as Record<string, unknown>;
	});
	function onDriverChange(next: Record<string, unknown>) {
		if (selectedId && selectedNode?.driver) {
			scene = updateNode(scene, selectedId, { driver: { type: selectedNode.driver.type, ...next } });
		}
	}

	function onBindingsChange(next: FieldTerm[]) {
		if (selectedId) scene = updateNode(scene, selectedId, { bindings: next });
	}
	function onConstraintsChange(next: Constraint[]) {
		if (selectedId) scene = updateNode(scene, selectedId, { constraints: next });
	}
	function onAppearanceChange(a: BodyAppearance) {
		if (selectedId) scene = updateNode(scene, selectedId, { appearance: a });
	}
	function onAtmosphereChange(a: BodyAtmosphere) {
		if (selectedId) scene = updateNode(scene, selectedId, { atmosphere: a });
	}

	// Hand the selected body off to the /planet editor: copy its resolved params into
	// /planet's session (so PlanetViewport hydrates them) + a persistent "link" record so
	// /planet can save edits back to this body. Persist the scene first so that save-back
	// round-trips against the current tree. See scene/planetHandoff.ts.
	function openInPlanetEditor(newTab: boolean) {
		if (!browser || !bodyNode) return;
		const presetName = bodyNode.appearance?.preset ?? DEFAULT_PRESET;
		const params = resolveBodyParams(bodyNode);
		saveScene();
		writeSession({
			schemaVersion: CURRENT_SNAPSHOT_VERSION,
			snapshot: toSnapshot({
				presetName,
				params,
				atmosphere: bodyAtmosphereToParameters(resolveBodyAtmosphere(bodyNode)),
				camera: {
					azimuth: 0.6,
					elevation: 0.35,
					distance: params.radius * 3,
					altitudeMeters: params.radius * 2,
					orbitSpeedRadPerSec: 0,
					lookAtHorizon: false
				}
			}),
			activeDocumentId: null
		});
		writeHandoffLink({ bodyId: bodyNode.id, bodyName: bodyNode.name, presetName, scenePath: page.url.pathname });
		if (newTab) window.open('/planet', '_blank');
		else goto('/planet');
	}

	// Live round-trip: when /planet (another tab) saves edits back into the scene, reload.
	// storage events fire only in *other* tabs, so this never echoes our own writes.
	$effect(() => {
		if (!browser) return;
		const onStorage = (e: StorageEvent) => {
			if (e.key === SCENE_KEY && e.newValue) {
				const reloaded = deserializeScene(e.newValue);
				if (reloaded) scene = reloaded;
			}
		};
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	});

	function addUnder(kind: 'group' | 'body' | 'orbit') {
		const parentId = selectedId ?? scene.rootId;
		if (kind === 'orbit') {
			const result = addOrbitingBody(scene, parentId);
			scene = result.scene;
			selectedId = result.bodyId;
			return;
		}
		const node = kind === 'group' ? makeGroup(parentId) : makeBody(parentId);
		scene = addChild(scene, node);
		selectedId = node.id; // select (and navigate to) the new node
	}

	function deleteSelected() {
		if (!selectedId || selectedId === scene.rootId) return;
		const parentId = getNode(scene, selectedId)?.parentId ?? null;
		scene = removeSubtree(scene, selectedId);
		selectedId = parentId && parentId !== scene.rootId ? parentId : null;
	}

	function renderProcedural() {
		if (bodyNode) focusedBodyId = bodyNode.id;
	}
</script>

<SceneEditorShell
	bind:scene
	bind:selectedId
	{selectedNode}
	{evaluatedNode}
	{breadcrumb}
	{editor}
	{schemaValue}
	{bodyNode}
	{hasAppearance}
	{driverValue}
	bind:clock
	bind:playing
	bind:speed
	bind:materialDebug
	bind:lookMode
	bind:viewportPrefs
	{focusedBody}
	onSave={saveScene}
	onReset={resetScene}
	onAddGroup={() => addUnder('group')}
	onAddBody={() => addUnder('body')}
	onAddOrbit={() => addUnder('orbit')}
	onDelete={deleteSelected}
	{onFieldChange}
	{onTransformChange}
	{onDriverChange}
	{onBindingsChange}
	{onConstraintsChange}
	{onAppearanceChange}
	{onAtmosphereChange}
	onRenderProcedural={renderProcedural}
	onOpenPlanet={() => openInPlanetEditor(false)}
	onOpenPlanetNewTab={() => openInPlanetEditor(true)}
	onCloseFocused={() => (focusedBodyId = null)}
/>
