<script lang="ts">
	import { onMount } from 'svelte';
	import Subdivide from '@virtual-planet/subdivide/Subdivide.svelte';
	import type { LayoutDocument } from '@virtual-planet/subdivide';
	import { effectiveGraphDocument, type GraphDocument } from '@virtual-planet/graph';

	import PreviewZone from './PreviewZone.svelte';
	import GraphCanvas from './GraphCanvas.svelte';
	import InspectorPanel from './InspectorPanel.svelte';
	import NodePalette from './NodePalette.svelte';
	import ValidationPanel from './ValidationPanel.svelte';
	import MarkupView from './MarkupView.svelte';
	import CodeView from './CodeView.svelte';
	import CompiledWgslPanel from './CompiledWgslPanel.svelte';
	import DocumentList from './DocumentList.svelte';
	import {
		createGraphArtifact,
		deleteDocument,
		formatGraphForDownload,
		listDocuments,
		loadActiveDocument,
		loadDocument,
		parseGraphArtifact,
		renameDocument,
		saveDocument,
		setActiveDocumentName,
		type GraphArtifact
	} from './documentStorage.js';
	import { applyEditIntent } from './irAdapter.js';
	import { animatedWorleyPipelineGraph } from './defaultGraph.js';
	import { defaultGraphEditorLayout } from './defaultLayout.js';
	import { loadEditorChrome, saveEditorChrome } from './layoutStorage.js';
	import type { NodeColorMode } from './nodeAccentColor.js';
	import type { PreviewRenderer } from './previewBackend.js';
	import {
		enumeratePreviewBuffers,
		inferDefaultPreviewBuffer
	} from './previewBuffers.js';
	import {
		ensurePaneSelection,
		prunePaneSelection,
		syncSelectionsForGraphChange,
		syncPreviewPanesWithLayout,
		type PreviewBuffersByPane,
		type PreviewPaneSelection
	} from './previewPaneSelection.js';
	import { createPreviewFrameLoop, type PreviewFrameLoop } from './previewFrameLoop.js';
	import { planIndependentGraphFramePasses } from '@virtual-planet/runtime-webgpu';
	import { listSampleArtifacts } from './samples.js';
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

	let { graph = $bindable(animatedWorleyPipelineGraph()), onchange }: Props = $props();

	let selectedNodeId = $state<string | null>(null);
	let selectedEdgeId = $state<string | null>(null);
	let nodeClipboard = $state<GraphNodeClipboard | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let storageMessage = $state<string | null>(null);
	let markupParseError = $state<string | null>(null);
	let codeSaveError = $state<string | null>(null);
	let selectedPrimitiveModuleId = $state<string | null>('noise.perlin3d');
	let previewBuffersByPane = $state<PreviewBuffersByPane>({});
	let nodeColorMode = $state<NodeColorMode>('category');
	let loadDocumentLayout = $state(true);
	let activeDocumentName = $state<string | null>(null);
	let documentReadOnly = $state(false);
	let documentRevision = $state(0);
	let previewRefreshEpoch = $state(0);
	let previewFrameLoop = $state<PreviewFrameLoop | null>(null);
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

	const previewDoc = $derived(effectiveGraphDocument(graph));
	const previewBuffers = $derived(enumeratePreviewBuffers(previewDoc));
	const previewBufferIds = $derived(new Set(previewBuffers.map((buffer) => buffer.id)));
	const defaultPreviewBufferId = $derived(
		inferDefaultPreviewBuffer(previewDoc)?.id ?? previewBuffers[0]?.id ?? null
		);
	const compileSignature = $derived(computeGraphCompileSignature(graph));
	const savedDocuments = $derived.by(() => {
		void documentRevision;
		return listDocuments();
	});
	const sampleDocuments = listSampleArtifacts();

	$effect(() => {
		void compileSignature;
		const timer = setTimeout(() => {
			previewRefreshEpoch++;
		}, 150);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const doc = previewDoc;
		const signature = compileSignature;
		void previewRefreshEpoch;

		if (planIndependentGraphFramePasses(doc).length === 0) {
			previewFrameLoop?.destroy();
			previewFrameLoop = null;
			return;
		}

		const loop = createPreviewFrameLoop({ graph: doc, compileSignature: signature });
		previewFrameLoop = loop;
		return () => {
			loop.destroy();
			if (previewFrameLoop === loop) {
				previewFrameLoop = null;
			}
		};
	});

	function syncPreviewSelectionsForGraph(doc: GraphDocument) {
		const buffers = enumeratePreviewBuffers(doc);
		const defaultId = inferDefaultPreviewBuffer(doc)?.id ?? buffers[0]?.id ?? null;
		previewBuffersByPane = syncSelectionsForGraphChange(
			previewBuffersByPane,
			new Set(buffers.map((buffer) => buffer.id)),
			defaultId
		);
	}

	function updatePreviewPaneSelection(paneId: string, selection: PreviewPaneSelection) {
		previewBuffersByPane = { ...previewBuffersByPane, [paneId]: selection };
		scheduleChromeSave();
	}

	function openPreviewPane(paneId: string) {
		previewBuffersByPane = ensurePaneSelection(
			previewBuffersByPane,
			paneId,
			previewBufferIds,
			defaultPreviewBufferId
		);
		scheduleChromeSave();
	}

	function closePreviewPane(paneId: string) {
		previewBuffersByPane = prunePaneSelection(previewBuffersByPane, paneId);
		scheduleChromeSave();
	}

	function setPreviewMode(mode: PreviewRenderer) {
		const next: PreviewBuffersByPane = { ...previewBuffersByPane };
		for (const [paneId, selection] of Object.entries(next)) {
			next[paneId] = { ...selection, rendererOverride: mode };
		}
		previewBuffersByPane = next;
		scheduleChromeSave();
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
			previewBuffersByPane?: PreviewBuffersByPane;
			nodeColorMode?: NodeColorMode;
			loadDocumentLayout?: boolean;
		}) => {
			saveEditorChrome(chrome);
		},
		300
	);

	function scheduleChromeSave(layoutDoc = layout) {
		debouncedSaveChrome({
			version: 1,
			layout: layoutDoc,
			previewBuffersByPane,
			nodeColorMode,
			loadDocumentLayout
		});
	}

	function onLoadDocumentLayoutChange(enabled: boolean) {
		loadDocumentLayout = enabled;
		scheduleChromeSave();
	}

	function buildCurrentArtifact(name: string, sample = documentReadOnly): GraphArtifact {
		return createGraphArtifact(name, graph, {
			layout,
			sample
		});
	}

	function persistActiveDocument(name: string) {
		const artifact = buildCurrentArtifact(name, false);
		saveDocument(artifact);
		activeDocumentName = name;
		documentReadOnly = false;
		documentRevision++;
		storageMessage = `Saved ${name}`;
	}

	function applyArtifact(artifact: GraphArtifact) {
		activeDocumentName = artifact.name;
		documentReadOnly = artifact.meta?.sample === true;
		if (loadDocumentLayout && artifact.layout) {
			layout = artifact.layout;
		}
		selectedNodeId = null;
		selectedEdgeId = null;
		updateGraph(artifact.graph, false);
		syncPreviewSelectionsForGraph(artifact.graph);
		scheduleChromeSave();
		storageMessage = artifact.meta?.sample ? `Example: ${artifact.name}` : `Loaded ${artifact.name}`;
	}

	function onNodeColorModeChange(mode: NodeColorMode) {
		nodeColorMode = mode;
		scheduleChromeSave();
	}

	function onLayoutChange(event: { layout: LayoutDocument }) {
		previewBuffersByPane = syncPreviewPanesWithLayout(
			previewBuffersByPane,
			event.layout,
			previewBufferIds,
			defaultPreviewBufferId
		);
		scheduleChromeSave(event.layout);
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
		syncPreviewSelectionsForGraph(next);
		onchange?.(next);
		if (persist && activeDocumentName && !documentReadOnly) {
			saveDocument(buildCurrentArtifact(activeDocumentName, false));
			documentRevision++;
		}
	}

	onMount(() => {
		const chrome = loadEditorChrome();
		if (chrome) {
			layout = chrome.layout;
			if (chrome.previewBuffersByPane) {
				previewBuffersByPane = chrome.previewBuffersByPane;
			}
			if (chrome.nodeColorMode) {
				nodeColorMode = chrome.nodeColorMode;
			}
			if (chrome.loadDocumentLayout === false) {
				loadDocumentLayout = false;
			}
		}

		const stored = loadActiveDocument();
		if (stored) {
			applyArtifact(stored);
		} else {
			syncPreviewSelectionsForGraph(graph);
		}
		previewBuffersByPane = syncPreviewPanesWithLayout(
			previewBuffersByPane,
			layout,
			previewBufferIds,
			defaultPreviewBufferId
		);
	});

	function newGraph() {
		const next = animatedWorleyPipelineGraph();
		activeDocumentName = null;
		documentReadOnly = false;
		setActiveDocumentName(null);
		clearSelection();
		updateGraph(next, false);
		storageMessage = 'New graph';
	}

	function saveCurrentDocument() {
		if (documentReadOnly || !activeDocumentName) {
			storageMessage = 'Use Save As for examples and unnamed graphs';
			return;
		}
		persistActiveDocument(activeDocumentName);
	}

	function saveDocumentAs(name: string) {
		persistActiveDocument(name);
	}

	function loadSavedDocument(name: string) {
		const artifact = loadDocument(name);
		if (!artifact) {
			storageMessage = 'Document not found';
			return;
		}
		applyArtifact(artifact);
		documentRevision++;
	}

	function loadSampleDocument(artifact: GraphArtifact) {
		applyArtifact(artifact);
	}

	function renameSavedDocument(fromName: string, toName: string) {
		renameDocument(fromName, toName);
		if (activeDocumentName === fromName) {
			activeDocumentName = toName;
		}
		documentRevision++;
		storageMessage = `Renamed to ${toName}`;
	}

	function deleteSavedDocument(name: string) {
		deleteDocument(name);
		if (activeDocumentName === name) {
			activeDocumentName = null;
			documentReadOnly = false;
		}
		documentRevision++;
		storageMessage = `Deleted ${name}`;
	}

	function downloadGraph() {
		const artifact = buildCurrentArtifact(activeDocumentName ?? 'graph');
		const blob = new Blob([formatGraphForDownload(artifact)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${artifact.name.replace(/\s+/g, '-').toLowerCase() || 'graph'}.json`;
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
				const artifact = parseGraphArtifact(String(reader.result ?? ''));
				activeDocumentName = null;
				documentReadOnly = false;
				applyArtifact({ ...artifact, meta: { ...artifact.meta, sample: false } });
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

{#snippet palette(_paneId)}
	<NodePalette onadd={addPrimitive} />
{/snippet}

{#snippet canvas(_paneId)}
	<GraphCanvas
		{graph}
		{selectedNodeId}
		{selectedEdgeId}
		{nodeColorMode}
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

{#snippet preview(paneId)}
	<PreviewZone
		{paneId}
		graph={previewDoc}
		buffers={previewBuffers}
		selection={previewBuffersByPane[paneId]}
		defaultBufferId={defaultPreviewBufferId}
		frameLoop={previewFrameLoop}
		refreshEpoch={previewRefreshEpoch}
		{compileSignature}
		onSelectionChange={(selection) => updatePreviewPaneSelection(paneId, selection)}
	/>
{/snippet}

{#snippet inspector(_paneId)}
	<InspectorPanel {graph} nodeId={selectedNodeId} onchange={updateGraph} />
{/snippet}

{#snippet validation(_paneId)}
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

{#snippet markup(_paneId)}
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

{#snippet code(_paneId)}
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

{#snippet compiled(_paneId)}
	<CompiledWgslPanel {graph} {compileSignature} />
{/snippet}

<svelte:window onkeydown={onWindowKeydown} />

<div class="graph-editor">
	<header class="toolbar">
		<DocumentList
			activeName={activeDocumentName}
			readOnly={documentReadOnly}
			loadLayout={loadDocumentLayout}
			{savedDocuments}
			{sampleDocuments}
			statusMessage={storageMessage}
			actions={{
				onNew: newGraph,
				onSave: saveCurrentDocument,
				onSaveAs: saveDocumentAs,
				onLoadSaved: loadSavedDocument,
				onLoadSample: loadSampleDocument,
				onRename: renameSavedDocument,
				onDelete: deleteSavedDocument,
				onDownload: downloadGraph,
				onUpload: triggerUpload,
				onLoadLayoutChange: onLoadDocumentLayoutChange
			}}
		/>
		<label class="node-color-mode">
			<span>Node tint</span>
			<select
				value={nodeColorMode}
				onchange={(event) =>
					onNodeColorModeChange(
						(event.currentTarget as HTMLSelectElement).value as NodeColorMode
					)}
			>
				<option value="category">Category</option>
				<option value="contract">Contract</option>
				<option value="off">Off</option>
			</select>
		</label>
		<button
			type="button"
			disabled={!selectedNodeId && !selectedEdgeId}
			onclick={deleteSelection}
		>
			Delete
		</button>
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
			onopen={(event) => {
				if (event.pane.zone === 'preview') {
					openPreviewPane(event.pane.id);
				}
			}}
			onclose={(event) => {
				if (event.pane.zone === 'preview') {
					closePreviewPane(event.pane.id);
				}
			}}
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
		align-items: flex-start;
		gap: 6px;
		padding: 6px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		flex: 0 0 auto;
	}

	.toolbar :global(.document-list) {
		flex: 1;
		min-width: 0;
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

	.node-color-mode {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		margin-left: 4px;
	}

	.node-color-mode select {
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
</style>
