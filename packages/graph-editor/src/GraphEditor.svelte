<script lang="ts">
	import Subdivide from '@virtual-planet/subdivide/Subdivide.svelte';
	import { createPaneId, type LayoutDocument } from '@virtual-planet/subdivide';
	import type { GraphDocument } from '@virtual-planet/graph';

	import CpuPreviewPanel from './CpuPreviewPanel.svelte';
	import GraphCanvas from './GraphCanvas.svelte';
	import InspectorPanel from './InspectorPanel.svelte';
	import NodePalette from './NodePalette.svelte';
	import ValidationPanel from './ValidationPanel.svelte';
	import { applyEditIntent } from './irAdapter.js';
	import { defaultPreviewGraph, primaryPreviewOutput } from './defaultGraph.js';

	interface Props {
		graph?: GraphDocument;
		onchange?: (next: GraphDocument) => void;
	}

	let { graph = $bindable(defaultPreviewGraph()), onchange }: Props = $props();

	let selectedNodeId = $state<string | null>(null);

	const previewOutput = $derived(primaryPreviewOutput(graph));

	const layout = $state<LayoutDocument>({
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
							size: 0.72
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'preview',
							pos: 0.72,
							size: 0.28
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
							size: 0.68
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'validation',
							pos: 0.68,
							size: 0.32
						}
					]
				}
			]
		}
	});

	function updateGraph(next: GraphDocument) {
		graph = next;
		onchange?.(next);
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
	<ValidationPanel {graph} />
{/snippet}

<div class="graph-editor">
	<Subdivide
		bind:layout
		zones={{ palette, canvas, preview, inspector, validation }}
		zoneLabels={{
			palette: 'Palette',
			canvas: 'Graph',
			preview: 'Preview',
			inspector: 'Inspector',
			validation: 'Validation'
		}}
		thickness="2px"
		padding="0px"
		color="#444"
	/>
</div>

<style>
	.graph-editor {
		width: 100%;
		height: 100%;
		min-height: 0;
		background: #12151f;
		color: #eef2ff;
	}
</style>
