<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createToySolarSystemScene } from '$lib/planet/scene/solarSystem.js';
	import { getNode } from '$lib/planet/scene/sceneTree.js';
	import { pathNodeIds, pathOf, resolvePath } from '$lib/planet/scene/scenePath.js';
	import { deserializeScene, serializeScene } from '$lib/planet/scene/sceneDocument.js';
	import { addChild, makeBody, makeGroup, removeSubtree } from '$lib/planet/scene/sceneEdit.js';
	import { editorForKind } from '$lib/planet/scene/nodeSchemas.js';
	import { fields } from '@virtual-planet/schema';
	import SystemMapPanel from '$lib/planet/components/SystemMapPanel.svelte';
	import SystemTreePanel from '$lib/planet/components/SystemTreePanel.svelte';
	import SchemaForm from '$lib/planet/components/SchemaForm.svelte';
	import type { PlanetScene } from '$lib/planet/scene/types.js';

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

	function addUnder(kind: 'group' | 'body') {
		const parentId = selectedId ?? scene.rootId;
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
				{#if editor?.mode === 'schema'}
					<SchemaForm schema={editor.schema} value={schemaValue} onchange={onFieldChange} />
				{/if}
				{#if selectedNode.kind === 'body'}
					<!-- The full procedural editor still lives at /planet (per-body params +
					     the nested route are future work). -->
					<a class="edit-link" href="/planet">Open in planet editor →</a>
				{/if}
			</div>
		{/if}
		<p class="hint">Click a body in the map or tree — the URL follows the scene path.</p>
	</aside>
	<main class="system-main">
		<SystemMapPanel {scene} bind:selectedId />
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
		flex: 1;
		min-width: 0;
		padding: 12px;
		box-sizing: border-box;
	}

	.system-main :global(.system-map) {
		height: 100%;
	}

	.system-main :global(.map-canvas) {
		height: calc(100% - 36px);
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

	.edit-link {
		color: #9ec0ff;
		text-decoration: none;
		font-size: 12px;
	}

	.edit-link:hover {
		text-decoration: underline;
	}

	.hint {
		margin: 0;
		font-size: 11px;
		opacity: 0.6;
	}
</style>
