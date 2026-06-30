<script lang="ts">
	import { onMount } from 'svelte';
	import Subdivide from '@virtual-planet/subdivide/Subdivide.svelte';
	import type { LayoutDocument } from '@virtual-planet/subdivide';
	import type { GraphDocument } from '@virtual-planet/graph';

	import CpuPreviewPanel from './CpuPreviewPanel.svelte';
	import GpuPreviewPanel from './GpuPreviewPanel.svelte';
	import MeshPreviewPanel from './MeshPreviewPanel.svelte';
	import VegetationPreviewPanel from './VegetationPreviewPanel.svelte';
	import EffectPreviewPanel from './EffectPreviewPanel.svelte';
	import GraphCanvas from './GraphCanvas.svelte';
	import InspectorPanel from './InspectorPanel.svelte';
	import NodePalette from './NodePalette.svelte';
	import ValidationPanel from './ValidationPanel.svelte';
	import MarkupView from './MarkupView.svelte';
	import CodeView from './CodeView.svelte';
	import CompiledWgslPanel from './CompiledWgslPanel.svelte';
	import {
		clearGraphStorage,
		formatGraphForDownload,
		loadGraphFromStorage,
		parseGraphFile,
		saveGraphToStorage
	} from './documentStorage.js';
	import { applyEditIntent } from './irAdapter.js';
	import { defaultPreviewGraph, primaryPreviewOutput } from './defaultGraph.js';
	import { defaultGraphEditorLayout } from './defaultLayout.js';
	import { loadEditorChrome, saveEditorChrome } from './layoutStorage.js';
	import { inferPreviewBackend, isPreviewModeCompatible, type PreviewBackend } from './previewBackend.js';
	import { getGraphSample, GRAPH_SAMPLES } from './samples.js';
	import { formatValidationIssue, fullValidation } from './graphValidation.js';
	import { computeGraphCompileSignature } from './graphCompileSignature.js';
	import type { MarkupParseError } from './markup/parseGraphMarkup.js';
	import {
		copyNodeToClipboard,
		pasteOffsetPosition,
		type GraphNodeClipboard
	} from './clipboard.js';
	import { createZoneContextMenus } from './paneMenus.js';
	import type { CodeViewActions } from './CodeView.svelte';
	import type { MarkupViewActions } from './MarkupView.svelte';

	interface Props {
		graph?: GraphDocument;
		onchange?: (next: GraphDocument) => void;
	}

	let { graph = $bindable(defaultPreviewGraph()), onchange }: Props = $props();

	let selectedNodeId = $state<string | null>(null);
	let selectedEdgeId = $state<string | null>(null);
	let nodeClipboard = $state<GraphNodeClipboard | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let storageMessage = $state<string | null>(null);
	let markupParseError = $state<string | null>(null);
	let codeSaveError = $state<string | null>(null);
	let selectedPrimitiveModuleId = $state<string | null>('noise.perlin3d');
	let previewMode = $state<PreviewBackend>('cpu');
	let previewRefreshEpoch = $state(0);
	let canvasFitView = $state<(() => void) | null>(null);
	let codeViewActions = $state<CodeViewActions | null>(null);
	let markupViewActions = $state<MarkupViewActions | null>(null);

	const zoneContextMenus = $derived(
		createZoneContextMenus({
			fitCanvasView: () => canvasFitView?.(),
			hasSelection: () => Boolean(selectedNodeId || selectedEdgeId),
			hasNodeSelection: () => Boolean(selectedNodeId),
			deleteSelection,
			duplicateSelectedNode,
			setPreviewMode,
			refreshPreview: () => {
				previewRefreshEpoch++;
			},
			clearSelection,
			saveCode: () => codeViewActions?.save(),
			isCodeDirty: () => codeViewActions?.isDirty() ?? false,
			revertCode: () => codeViewActions?.revert(),
			resyncMarkup: () => markupViewActions?.resyncFromGraph(),
			copyMarkup: () => {
				void markupViewActions?.copyMarkup();
			},
			copyValidationReport: () => {
				const result = fullValidation(graph);
				const lines: string[] = [];
				if (markupParseError) lines.push(`Markup: ${markupParseError}`);
				if (codeSaveError) lines.push(`Code: ${codeSaveError}`);
				if (result.ok && result.issues.length === 0) {
					lines.push('Graph is valid.');
				} else {
					for (const issue of result.issues) {
						lines.push(formatValidationIssue(issue));
					}
				}
				void navigator.clipboard.writeText(lines.join('\n'));
			}
		})
	);

	const previewOutput = $derived(primaryPreviewOutput(graph));
	const compileSignature = $derived(computeGraphCompileSignature(graph));

	$effect(() => {
		void compileSignature;
		const timer = setTimeout(() => {
			previewRefreshEpoch++;
		}, 150);
		return () => clearTimeout(timer);
	});

	function syncPreviewModeForGraph(doc: GraphDocument, force = false) {
		const inferred = inferPreviewBackend(doc);
		if (force || !isPreviewModeCompatible(doc, previewMode)) {
			if (previewMode === 'mesh' || previewMode === 'vegetation') {
				if (force) previewMode = inferred;
			} else {
				previewMode = inferred;
			}
		}
	}

	function debounce<T extends (...args: never[]) => void>(
		fn: T,
		ms: number
	): (...args: Parameters<T>) => void {
		let timer: ReturnType<typeof setTimeout> | undefined;
		return (...args: Parameters<T>) => {
			clearTimeout(timer);
			timer = setTimeout(() => fn(...args), ms);
		};
	}

	const debouncedSaveChrome = debounce(
		(chrome: {
			version: 1;
			layout: LayoutDocument;
			previewMode: PreviewBackend;
		}) => {
			saveEditorChrome(chrome);
		},
		300
	);

	function scheduleChromeSave(layoutDoc = layout) {
		debouncedSaveChrome({ version: 1, layout: layoutDoc, previewMode });
	}

	function onLayoutChange(event: { layout: LayoutDocument }) {
		scheduleChromeSave(event.layout);
	}

	function setPreviewMode(mode: PreviewBackend) {
		previewMode = mode;
		scheduleChromeSave();
	}

	let lastCodeViewSyncNodeId = $state<string | null>(null);

	$effect(() => {
		if (!selectedNodeId) {
			lastCodeViewSyncNodeId = null;
			return;
		}
		if (selectedNodeId === lastCodeViewSyncNodeId) return;
		lastCodeViewSyncNodeId = selectedNodeId;
		const node = graph.nodes.find((candidate) => candidate.id === selectedNodeId);
		if (node) {
			selectedPrimitiveModuleId = node.primitive;
		}
	});

	let layout = $state<LayoutDocument>(defaultGraphEditorLayout());

	function updateGraph(next: GraphDocument, persist = true) {
		graph = next;
		markupParseError = null;
		codeSaveError = null;
		syncPreviewModeForGraph(next);
		onchange?.(next);
		if (persist) {
			saveGraphToStorage(next);
		}
	}

	onMount(() => {
		const chrome = loadEditorChrome();
		if (chrome) {
			layout = chrome.layout;
			if (chrome.previewMode) {
				previewMode = chrome.previewMode;
			}
		}

		const stored = loadGraphFromStorage();
		if (stored) {
			updateGraph(stored, false);
		}
	});

	function newGraph() {
		const next = defaultPreviewGraph();
		clearGraphStorage();
		clearSelection();
		updateGraph(next);
		storageMessage = 'New graph';
	}

	function loadSample(sampleId: string) {
		const sample = getGraphSample(sampleId);
		if (!sample) {
			storageMessage = 'Unknown sample';
			return;
		}
		clearGraphStorage();
		clearSelection();
		const next = sample.build();
		updateGraph(next);
		previewMode = inferPreviewBackend(next);
		scheduleChromeSave();
		storageMessage = sample.label;
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
		selectedEdgeId = null;
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
				clearSelection();
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

	function clearSelection() {
		selectedNodeId = null;
		selectedEdgeId = null;
	}

	function deleteSelection() {
		if (selectedNodeId) {
			updateGraph(applyEditIntent(graph, { kind: 'remove-node', nodeId: selectedNodeId }));
			clearSelection();
			return;
		}
		if (selectedEdgeId) {
			updateGraph(applyEditIntent(graph, { kind: 'remove-edge', edgeId: selectedEdgeId }));
			clearSelection();
		}
	}

	function duplicateSelectedNode() {
		if (!selectedNodeId) return;
		const source = graph.nodes.find((node) => node.id === selectedNodeId);
		if (!source) return;

		const position = pasteOffsetPosition(source.position ?? { x: 0, y: 0 });
		const next = applyEditIntent(graph, {
			kind: 'duplicate-node',
			sourceNodeId: selectedNodeId,
			position
		});
		updateGraph(next);
		const duplicate = next.nodes[next.nodes.length - 1];
		selectedNodeId = duplicate?.id ?? null;
		selectedEdgeId = null;
	}

	function copySelectedNode() {
		if (!selectedNodeId) return;
		nodeClipboard = copyNodeToClipboard(graph, selectedNodeId);
	}

	function pasteClipboardNode() {
		if (!nodeClipboard) return;
		const offset = graph.nodes.length * 24;
		const next = applyEditIntent(graph, {
			kind: 'add-node',
			primitiveId: nodeClipboard.primitiveId,
			position: { x: 40 + offset, y: 40 + offset }
		});
		let withParams = next;
		if (nodeClipboard.params !== undefined) {
			const nodeId = next.nodes[next.nodes.length - 1]?.id;
			if (nodeId) {
				withParams = applyEditIntent(next, {
					kind: 'set-params',
					nodeId,
					params: { ...nodeClipboard.params }
				});
			}
		}
		updateGraph(withParams);
		const pasted = withParams.nodes[withParams.nodes.length - 1];
		selectedNodeId = pasted?.id ?? null;
		selectedEdgeId = null;
	}

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (isEditableTarget(event.target)) return;

		if (event.key === 'Delete' || event.key === 'Backspace') {
			if (!selectedNodeId && !selectedEdgeId) return;
			event.preventDefault();
			deleteSelection();
			return;
		}

		const mod = event.ctrlKey || event.metaKey;
		if (!mod) return;

		if (event.key === 'd' || event.key === 'D') {
			if (!selectedNodeId) return;
			event.preventDefault();
			duplicateSelectedNode();
			return;
		}

		if (event.key === 'c' || event.key === 'C') {
			if (!selectedNodeId) return;
			event.preventDefault();
			copySelectedNode();
			return;
		}

		if (event.key === 'v' || event.key === 'V') {
			if (!nodeClipboard) return;
			event.preventDefault();
			pasteClipboardNode();
		}
	}
</script>

{#snippet palette()}
	<NodePalette onadd={addPrimitive} />
{/snippet}

{#snippet canvas()}
	<GraphCanvas
		{graph}
		{selectedNodeId}
		{selectedEdgeId}
		onchange={updateGraph}
		onregisterfitview={(api) => {
			canvasFitView = () => api.fitView();
		}}
		onselectnode={(nodeId) => {
			selectedNodeId = nodeId;
			if (nodeId) selectedEdgeId = null;
		}}
		onselectedge={(edgeId) => {
			selectedEdgeId = edgeId;
			if (edgeId) selectedNodeId = null;
		}}
	/>
{/snippet}

{#snippet preview()}
	<div class="preview-zone">
		<div class="preview-toggle" role="tablist" aria-label="Preview backend">
			<button
				type="button"
				role="tab"
				aria-selected={previewMode === 'cpu'}
				class:active={previewMode === 'cpu'}
				onclick={() => setPreviewMode('cpu')}
			>
				CPU
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={previewMode === 'gpu'}
				class:active={previewMode === 'gpu'}
				onclick={() => setPreviewMode('gpu')}
			>
				GPU
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={previewMode === 'mesh'}
				class:active={previewMode === 'mesh'}
				onclick={() => setPreviewMode('mesh')}
			>
				Mesh
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={previewMode === 'effect'}
				class:active={previewMode === 'effect'}
				onclick={() => setPreviewMode('effect')}
			>
				Effect
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={previewMode === 'vegetation'}
				class:active={previewMode === 'vegetation'}
				onclick={() => setPreviewMode('vegetation')}
			>
				Vegetation
			</button>
		</div>
		{#if previewMode === 'cpu'}
			<CpuPreviewPanel
				{graph}
				output={previewOutput}
				refreshEpoch={previewRefreshEpoch}
				{compileSignature}
			/>
		{:else if previewMode === 'gpu'}
			<GpuPreviewPanel
				{graph}
				output={previewOutput}
				refreshEpoch={previewRefreshEpoch}
				{compileSignature}
			/>
		{:else if previewMode === 'mesh'}
			<MeshPreviewPanel refreshEpoch={previewRefreshEpoch} {compileSignature} />
		{:else if previewMode === 'effect'}
			<EffectPreviewPanel
				{graph}
				output={previewOutput}
				refreshEpoch={previewRefreshEpoch}
				{compileSignature}
			/>
		{:else}
			<VegetationPreviewPanel {graph} refreshEpoch={previewRefreshEpoch} {compileSignature} />
		{/if}
	</div>
{/snippet}

{#snippet inspector()}
	<InspectorPanel {graph} nodeId={selectedNodeId} onchange={updateGraph} />
{/snippet}

{#snippet validation()}
	<ValidationPanel
		{graph}
		markupError={markupParseError ?? codeSaveError}
		onfocusnode={(nodeId) => {
			selectedNodeId = nodeId;
			selectedEdgeId = null;
		}}
		onfocusedge={(edgeId) => {
			selectedEdgeId = edgeId;
			selectedNodeId = null;
		}}
	/>
{/snippet}

{#snippet markup()}
	<MarkupView
		{graph}
		onchange={updateGraph}
		registerActions={(actions) => {
			markupViewActions = actions;
		}}
		onerror={(error: MarkupParseError) => {
			markupParseError = error.message;
		}}
	/>
{/snippet}

{#snippet code()}
	<CodeView
		{graph}
		bind:moduleId={selectedPrimitiveModuleId}
		{compileSignature}
		registerActions={(actions) => {
			codeViewActions = actions;
		}}
		onchange={updateGraph}
		onerror={(message) => {
			codeSaveError = message;
		}}
	/>
{/snippet}

{#snippet compiled()}
	<CompiledWgslPanel {graph} {compileSignature} />
{/snippet}

<svelte:window onkeydown={onWindowKeydown} />

<div class="graph-editor">
	<header class="toolbar">
		<button type="button" onclick={newGraph}>New</button>
		<button type="button" onclick={saveGraph}>Save</button>
		<button type="button" onclick={loadGraph}>Load</button>
		<button type="button" onclick={downloadGraph}>Download</button>
		<button type="button" onclick={triggerUpload}>Upload</button>
		<label class="sample-picker">
			<span>Samples</span>
			<select onchange={(event) => loadSample((event.currentTarget as HTMLSelectElement).value)}>
				<option value="" selected disabled>Load sample…</option>
				{#each GRAPH_SAMPLES as sample (sample.id)}
					<option value={sample.id}>{sample.label}</option>
				{/each}
			</select>
		</label>
		<button
			type="button"
			disabled={!selectedNodeId && !selectedEdgeId}
			onclick={deleteSelection}
		>
			Delete
		</button>
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
			onlayoutchange={onLayoutChange}
			{zoneContextMenus}
			zones={{ palette, canvas, preview, code, compiled, inspector, validation, markup }}
			zoneLabels={{
				palette: 'Palette',
				canvas: 'Graph',
				preview: 'Preview',
				code: 'Code',
				compiled: 'Compiled WGSL',
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

	.toolbar button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.sample-picker {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		margin-left: 4px;
	}

	.sample-picker select {
		font-size: 11px;
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #1a1f30;
		color: inherit;
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

	.preview-zone {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.preview-toggle {
		display: flex;
		gap: 4px;
		padding: 6px 8px 0;
		flex: 0 0 auto;
	}

	.preview-toggle button {
		font-size: 10px;
		padding: 3px 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
		opacity: 0.7;
	}

	.preview-toggle button.active {
		opacity: 1;
		border-color: rgba(255, 255, 255, 0.35);
		background: #24304a;
	}

	.preview-toggle button:hover {
		border-color: rgba(255, 255, 255, 0.3);
	}
</style>
