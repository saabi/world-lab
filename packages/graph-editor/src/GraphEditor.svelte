<script lang="ts">
	import { onMount } from 'svelte';
	import Subdivide from '@virtual-planet/subdivide/Subdivide.svelte';
	import { createPaneId, type LayoutDocument } from '@virtual-planet/subdivide';
	import type { GraphDocument } from '@virtual-planet/graph';

	import CpuPreviewPanel from './CpuPreviewPanel.svelte';
	import GraphCanvas from './GraphCanvas.svelte';
	import InspectorPanel from './InspectorPanel.svelte';
	import NodePalette from './NodePalette.svelte';
	import ValidationPanel from './ValidationPanel.svelte';
	import MarkupView from './MarkupView.svelte';
	import CodeView from './CodeView.svelte';
	import {
		clearGraphStorage,
		formatGraphForDownload,
		loadGraphFromStorage,
		parseGraphFile,
		saveGraphToStorage
	} from './documentStorage.js';
	import { applyEditIntent } from './irAdapter.js';
	import { defaultPreviewGraph, primaryPreviewOutput } from './defaultGraph.js';
	import type { MarkupParseError } from './markup/parseGraphMarkup.js';

	interface Props {
		graph?: GraphDocument;
		onchange?: (next: GraphDocument) => void;
	}

	let { graph = $bindable(defaultPreviewGraph()), onchange }: Props = $props();

	let selectedNodeId = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let storageMessage = $state<string | null>(null);
	let markupParseError = $state<string | null>(null);
	let codeSaveError = $state<string | null>(null);
	let selectedPrimitiveModuleId = $state<string | null>('noise.perlin3d');

	const previewOutput = $derived(primaryPreviewOutput(graph));

	$effect(() => {
		if (!selectedNodeId) return;
		const node = graph.nodes.find((candidate) => candidate.id === selectedNodeId);
		if (node) {
			selectedPrimitiveModuleId = node.primitive;
		}
	});

	let layout = $state<LayoutDocument>({
		root: {
			type: 'group',
			row: true,
			pos: 0,
			size: 1,
			children: [
				{
					type: 'pane',
					id: createPaneId(),
					zone: 'palette',
					pos: 0,
					size: 0.16
				},
				{
					type: 'group',
					row: false,
					pos: 0.16,
					size: 0.58,
					children: [
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'canvas',
							pos: 0,
							size: 0.62
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'preview',
							pos: 0.62,
							size: 0.2
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'code',
							pos: 0.82,
							size: 0.18
						}
					]
				},
				{
					type: 'group',
					row: false,
					pos: 0.74,
					size: 0.26,
					children: [
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'inspector',
							pos: 0,
							size: 0.52
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'validation',
							pos: 0.52,
							size: 0.24
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'markup',
							pos: 0.76,
							size: 0.24
						}
					]
				}
			]
		}
	});

	function updateGraph(next: GraphDocument, persist = true) {
		graph = next;
		markupParseError = null;
		codeSaveError = null;
		onchange?.(next);
		if (persist) {
			saveGraphToStorage(next);
		}
	}

	onMount(() => {
		const stored = loadGraphFromStorage();
		if (stored) {
			updateGraph(stored, false);
		}
	});

	function newGraph() {
		const next = defaultPreviewGraph();
		clearGraphStorage();
		selectedNodeId = null;
		updateGraph(next);
		storageMessage = 'New graph';
	}

	function saveGraph() {
		saveGraphToStorage(graph);
		storageMessage = 'Saved';
	}

	function loadGraph() {
		const stored = loadGraphFromStorage();
		if (!stored) {
			storageMessage = 'Nothing saved';
			return;
		}
		selectedNodeId = null;
		updateGraph(stored, false);
		storageMessage = 'Loaded';
	}

	function downloadGraph() {
		const blob = new Blob([formatGraphForDownload(graph)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'graph.json';
		anchor.click();
		URL.revokeObjectURL(url);
		storageMessage = 'Downloaded';
	}

	function triggerUpload() {
		fileInput?.click();
	}

	function onFileSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			try {
				const next = parseGraphFile(String(reader.result ?? ''));
				selectedNodeId = null;
				updateGraph(next);
				storageMessage = 'Uploaded';
			} catch (error) {
				storageMessage = error instanceof Error ? error.message : 'Upload failed';
			}
		};
		reader.readAsText(file);
	}

	function addPrimitive(primitiveId: string) {
		const offset = graph.nodes.length * 24;
		updateGraph(
			applyEditIntent(graph, {
				kind: 'add-node',
				primitiveId,
				position: { x: 40 + offset, y: 40 + offset }
			})
		);
	}
</script>

{#snippet palette()}
	<NodePalette onadd={addPrimitive} />
{/snippet}

{#snippet canvas()}
	<GraphCanvas
		{graph}
		{selectedNodeId}
		onchange={updateGraph}
		onselect={(nodeId) => (selectedNodeId = nodeId)}
	/>
{/snippet}

{#snippet preview()}
	<CpuPreviewPanel {graph} output={previewOutput} />
{/snippet}

{#snippet inspector()}
	<InspectorPanel {graph} nodeId={selectedNodeId} onchange={updateGraph} />
{/snippet}

{#snippet validation()}
	<ValidationPanel {graph} markupError={markupParseError ?? codeSaveError} />
{/snippet}

{#snippet markup()}
	<MarkupView
		{graph}
		onchange={updateGraph}
		onerror={(error: MarkupParseError) => {
			markupParseError = error.message;
		}}
	/>
{/snippet}

{#snippet code()}
	<CodeView
		{graph}
		bind:moduleId={selectedPrimitiveModuleId}
		onchange={updateGraph}
		onerror={(message) => {
			codeSaveError = message;
		}}
	/>
{/snippet}

<div class="graph-editor">
	<header class="toolbar">
		<button type="button" onclick={newGraph}>New</button>
		<button type="button" onclick={saveGraph}>Save</button>
		<button type="button" onclick={loadGraph}>Load</button>
		<button type="button" onclick={downloadGraph}>Download</button>
		<button type="button" onclick={triggerUpload}>Upload</button>
		{#if storageMessage}
			<span class="status">{storageMessage}</span>
		{/if}
	</header>
	<input
		bind:this={fileInput}
		class="file-input"
		type="file"
		accept="application/json,.json"
		onchange={onFileSelected}
	/>
	<div class="workspace">
		<Subdivide
			bind:layout
			zones={{ palette, canvas, preview, code, inspector, validation, markup }}
			zoneLabels={{
				palette: 'Palette',
				canvas: 'Graph',
				preview: 'Preview',
				code: 'Code',
				inspector: 'Inspector',
				validation: 'Validation',
				markup: 'Markup'
			}}
			thickness="2px"
			padding="0px"
			color="#444"
		/>
	</div>
</div>

<style>
	.graph-editor {
		width: 100%;
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: #12151f;
		color: #eef2ff;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		flex: 0 0 auto;
	}

	.toolbar button {
		font-size: 11px;
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
	}

	.toolbar button:hover {
		border-color: rgba(255, 255, 255, 0.3);
	}

	.status {
		margin-left: 8px;
		font-size: 11px;
		opacity: 0.7;
	}

	.file-input {
		display: none;
	}

	.workspace {
		flex: 1;
		min-height: 0;
		position: relative;
		overflow: hidden;
	}
</style>
