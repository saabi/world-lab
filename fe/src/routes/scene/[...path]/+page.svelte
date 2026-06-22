<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createToySolarSystemScene } from '$lib/planet/scene/solarSystem.js';
	import { getNode } from '$lib/planet/scene/sceneTree.js';
	import { pathNodeIds, pathOf, resolvePath } from '$lib/planet/scene/scenePath.js';
	import { deserializeScene, serializeScene } from '$lib/planet/scene/sceneDocument.js';
	import {
		addChild,
		addOrbitingBody,
		makeBody,
		makeGroup,
		removeSubtree
	} from '$lib/planet/scene/sceneEdit.js';
	import { driverOutputs, driverSchemaFor, editorForKind } from '$lib/planet/scene/nodeSchemas.js';
	import { evaluateScene } from '$lib/planet/scene/driver.js';
	import { fields } from '@virtual-planet/schema';
	import SystemMapPanel from '$lib/planet/components/SystemMapPanel.svelte';
	import SceneViewport3D from '$lib/planet/components/SceneViewport3D.svelte';
	import {
		MATERIAL_DEBUG_LABELS,
		type MaterialDebugMode
	} from '$lib/planet/material/biomes.js';
	import type { OrbitLookMode } from '$lib/planet/camera/orbitCamera.js';
	import SystemTreePanel from '$lib/planet/components/SystemTreePanel.svelte';
	import SchemaForm from '$lib/planet/components/SchemaForm.svelte';
	import TransformEditor from '$lib/planet/components/TransformEditor.svelte';
	import BindingsEditor from '$lib/planet/components/BindingsEditor.svelte';
	import ConstraintsEditor from '$lib/planet/components/ConstraintsEditor.svelte';
	import AppearanceEditor from '$lib/planet/components/AppearanceEditor.svelte';
	import FocusedBodyView from '$lib/planet/components/FocusedBodyView.svelte';
	import type {
		BodyAppearance,
		BodyLod,
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
	// Live atmosphere debug knobs for the procedural render (world-scale strengths).
	let atmo = $state({ enabled: true, rayleigh: 1.0, mie: 1.0, fog: 0.8 });
	// Material debug view for the procedural body — parity diagnostic mirroring /planet's
	// dropdown (e.g. body-dir / lat-long grid to spot tessellation-dependent sampling).
	let materialDebug = $state<MaterialDebugMode>('off');
	// Focused-body look mode — viewport state (not body data). planet-center targets the
	// body; horizon aims along travel for low-orbit views, matching /planet's toggle.
	let lookMode = $state<OrbitLookMode>('planet-center');
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
	function onLodChange(l: BodyLod) {
		if (selectedId) scene = updateNode(scene, selectedId, { lod: l });
	}

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
</script>

<div class="system-page">
	<aside class="system-sidebar">
		<div class="doc-controls">
			<button type="button" onclick={saveScene}>Save</button>
			<button type="button" onclick={resetScene}>Reset</button>
		</div>
		<SystemTreePanel bind:scene bind:selectedId />
		<div class="edit-actions">
			<button type="button" onclick={() => addUnder('group')}>+ Group</button>
			<button type="button" onclick={() => addUnder('body')}>+ Body</button>
			<button type="button" onclick={() => addUnder('orbit')}>+ Orbit</button>
			<button type="button" onclick={deleteSelected} disabled={!selectedId}>Delete</button>
		</div>
		{#if selectedNode}
			<nav class="breadcrumb" aria-label="Scene path">
				<button type="button" class="crumb" onclick={() => (selectedId = null)}>/</button>
				{#each breadcrumb as crumb (crumb.id)}
					<span class="crumb-sep">/</span>
					<button type="button" class="crumb" onclick={() => (selectedId = crumb.id)}>
						{crumb.name}
					</button>
				{/each}
			</nav>
			<div class="node-editor">
				<span class="edit-name">{selectedNode.name}</span>
				<TransformEditor
					node={selectedNode}
					evaluated={evaluatedNode ?? selectedNode}
					onchange={onTransformChange}
				/>
				{#if selectedNode.driver}
					<div class="driver-section">
						<span class="section-label">Driver · {selectedNode.driver.type}</span>
						<SchemaForm
							schema={driverSchemaFor(selectedNode.driver)}
							value={driverValue}
							onchange={onDriverChange}
						/>
						<span class="driver-outputs">
							outputs: {driverOutputs(selectedNode.driver).join(', ')}
						</span>
					</div>
				{/if}
				<div class="dataflow-section">
					<span class="section-label">Bindings</span>
					<BindingsEditor node={selectedNode} onchange={onBindingsChange} />
				</div>
				<div class="dataflow-section">
					<span class="section-label">Constraints</span>
					<ConstraintsEditor node={selectedNode} onchange={onConstraintsChange} />
				</div>
				{#if editor?.mode === 'schema'}
					<SchemaForm schema={editor.schema} value={schemaValue} onchange={onFieldChange} />
				{/if}
				{#if bodyNode && hasAppearance}
					<div class="appearance-section">
						<span class="section-label">Appearance</span>
						<AppearanceEditor
							body={bodyNode}
							onappearance={onAppearanceChange}
							onlod={onLodChange}
						/>
						<button type="button" class="render-btn" onclick={() => (focusedBodyId = bodyNode.id)}>
							Render procedurally →
						</button>
					</div>
				{/if}
				{#if selectedNode.kind === 'body'}
					<!-- The full procedural editor still lives at /planet (per-body params +
					     the nested route are future work). -->
					<a class="edit-link" href="/planet">Open in planet editor →</a>
				{/if}
			</div>
		{/if}
		<div class="atmo-debug">
			<label class="atmo-head">
				<input type="checkbox" bind:checked={atmo.enabled} /> Atmosphere (debug)
			</label>
			<label class="atmo-row">
				<span>rayleigh {atmo.rayleigh.toFixed(4)}</span>
				<input type="range" min="0" max="0.05" step="0.0005" bind:value={atmo.rayleigh} />
			</label>
			<label class="atmo-row">
				<span>mie {atmo.mie.toFixed(4)}</span>
				<input type="range" min="0" max="0.05" step="0.0005" bind:value={atmo.mie} />
			</label>
			<label class="atmo-row">
				<span>fog {atmo.fog.toFixed(3)}</span>
				<input type="range" min="0" max="0.5" step="0.005" bind:value={atmo.fog} />
			</label>
			<label class="atmo-row">
				<span>debug view</span>
				<select bind:value={materialDebug}>
					{#each MATERIAL_DEBUG_LABELS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>
			<label class="atmo-head">
				<input
					type="checkbox"
					checked={lookMode === 'horizon'}
					onchange={(e) => (lookMode = e.currentTarget.checked ? 'horizon' : 'planet-center')}
				/> Horizon look
			</label>
		</div>
		<p class="hint">Click a body in the map or tree — the URL follows the scene path.</p>
	</aside>
	<main class="system-main">
		<SceneViewport3D {scene} bind:selectedId time={clock} {atmo} {materialDebug} {lookMode} />
		<div class="map-inset">
			<SystemMapPanel {scene} bind:selectedId bind:time={clock} />
		</div>
		{#if focusedBody}
			<FocusedBodyView body={focusedBody} onclose={() => (focusedBodyId = null)} />
		{/if}
	</main>
</div>

<style>
	.system-page {
		display: flex;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		background: #05070e;
		color: #e8ecf8;
		font: 13px/1.4 system-ui, sans-serif;
	}

	.system-sidebar {
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 300px;
		flex-shrink: 0;
		padding: 12px;
		box-sizing: border-box;
		overflow-y: auto;
		border-right: 1px solid rgba(255, 255, 255, 0.1);
	}

	.system-main {
		position: relative;
		flex: 1;
		min-width: 0;
		padding: 12px;
		box-sizing: border-box;
	}

	/* 2D map as an inset minimap over the 3D view (doubles as the HUD-element use). */
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

	.doc-controls {
		display: flex;
		gap: 6px;
	}

	.doc-controls button {
		flex: 1;
		font: 11px/1.2 system-ui, sans-serif;
		padding: 4px 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
	}

	.doc-controls button:hover {
		background: #252d45;
	}

	.edit-actions {
		display: flex;
		gap: 6px;
	}

	.edit-actions button {
		flex: 1;
		font: 11px/1.2 system-ui, sans-serif;
		padding: 4px 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
	}

	.edit-actions button:hover:not(:disabled) {
		background: #252d45;
	}

	.edit-actions button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.breadcrumb {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
		font-size: 11px;
		opacity: 0.85;
	}

	.crumb {
		background: none;
		border: none;
		padding: 0 1px;
		color: #9ec0ff;
		cursor: pointer;
		font: inherit;
	}

	.crumb:hover {
		text-decoration: underline;
	}

	.crumb-sep {
		opacity: 0.4;
	}

	.node-editor {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 10px;
		background: rgba(8, 10, 20, 0.88);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
	}

	.edit-name {
		font-weight: 600;
	}

	.driver-section {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 6px 8px;
		background: rgba(124, 92, 255, 0.08);
		border: 1px solid rgba(124, 92, 255, 0.25);
		border-radius: 6px;
	}

	.section-label {
		font-size: 11px;
		font-weight: 600;
		color: #c7a6ff;
	}

	.dataflow-section {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 6px 8px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
	}

	.dataflow-section .section-label {
		color: #aab2c8;
	}

	.appearance-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 8px;
		background: rgba(110, 160, 120, 0.08);
		border: 1px solid rgba(110, 160, 120, 0.22);
		border-radius: 6px;
	}

	.appearance-section .section-label {
		color: #9fcfae;
	}

	.render-btn {
		align-self: flex-start;
		margin-top: 4px;
		font: 11px/1.2 system-ui, sans-serif;
		padding: 3px 10px;
		border-radius: 4px;
		border: 1px solid rgba(110, 160, 120, 0.4);
		background: rgba(110, 160, 120, 0.15);
		color: #cfedd6;
		cursor: pointer;
	}

	.driver-outputs {
		font-family: ui-monospace, monospace;
		font-size: 10px;
		opacity: 0.6;
	}

	.edit-link {
		color: #9ec0ff;
		text-decoration: none;
		font-size: 12px;
	}

	.edit-link:hover {
		text-decoration: underline;
	}

	.atmo-debug {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 8px;
		background: rgba(124, 92, 255, 0.06);
		border: 1px solid rgba(124, 92, 255, 0.2);
		border-radius: 6px;
		font-size: 11px;
	}

	.atmo-head {
		display: flex;
		align-items: center;
		gap: 5px;
		font-weight: 600;
		color: #c7a6ff;
	}

	.atmo-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.atmo-row span {
		flex: 0 0 38%;
		font-variant-numeric: tabular-nums;
		opacity: 0.8;
	}

	.atmo-row input[type='range'] {
		flex: 1;
		min-width: 0;
	}

	.hint {
		margin: 0;
		font-size: 11px;
		opacity: 0.6;
	}
</style>
