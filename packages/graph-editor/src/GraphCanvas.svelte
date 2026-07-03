<script lang="ts">
	import {
		SvelteFlow,
		Background,
		Controls,
		type Connection,
		type Node,
		type Edge
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	import type { GraphDocument } from '@world-lab/graph';
	import GraphNodeView from './GraphNodeView.svelte';
	import CanvasFitViewBridge from './CanvasFitViewBridge.svelte';
	import CanvasPaletteDropBridge from './CanvasPaletteDropBridge.svelte';
	import { setGraphCanvasContext } from './graphCanvasContext.js';
	import type { NodeColorMode } from './nodeAccentColor.js';
	import { inputHandleId, outputHandleId, portIdFromHandle } from './portHandles.js';
	import {
		applyEditIntent,
		graphToFlow,
		validateConnection,
		type FlowEdgeData,
		type FlowNodeData
	} from './irAdapter.js';
	import { buildValidationHighlightIndex, fullValidation } from './graphValidation.js';
	import { resolvePaletteDrop } from './paletteDrag.js';

	interface Props {
		graph: GraphDocument;
		selectedNodeId?: string | null;
		selectedEdgeId?: string | null;
		onchange?: (next: GraphDocument, historyLabel?: string) => void;
		onselectnode?: (nodeId: string | null) => void;
		onselectedge?: (edgeId: string | null) => void;
		onregisterfitview?: (api: { fitView: () => void }) => void;
		nodeColorMode?: NodeColorMode;
	}

	let {
		graph,
		selectedNodeId = null,
		selectedEdgeId = null,
		onchange,
		onselectnode,
		onselectedge,
		onregisterfitview,
		nodeColorMode = 'category'
	}: Props = $props();

	const nodeTypes = { graphNode: GraphNodeView };

	setGraphCanvasContext({
		onReplacePrimitive(nodeId, primitiveId) {
			onchange?.(
				applyEditIntent(graph, { kind: 'replace-node-primitive', nodeId, primitiveId }),
				'Swap primitive'
			);
		},
		onAddConnectedNode({ source, sourceDirection, primitiveId, position }) {
			onchange?.(
				applyEditIntent(graph, {
					kind: 'add-connected-node',
					primitiveId,
					position,
					source,
					sourceDirection
				}),
				'Add connected node'
			);
		},
		getNodeColorMode: () => nodeColorMode
	});

	let nodes = $state.raw<Node<FlowNodeData>[]>([]);
	let edges = $state.raw<Edge<FlowEdgeData>[]>([]);

	$effect(() => {
		const highlights = buildValidationHighlightIndex(fullValidation(graph).issues);
		const flow = graphToFlow(graph);
		nodes = flow.nodes.map((node) => {
			let nodeIssue: 'error' | 'warning' | undefined;
			if (highlights.nodeErrors.has(node.id)) nodeIssue = 'error';
			else if (highlights.nodeWarnings.has(node.id)) nodeIssue = 'warning';

			const inputIssues: Record<string, 'error' | 'warning'> = {};
			for (const input of node.data.inputs) {
				const severity = highlights.ports.get(`${node.id}:${input.id}`);
				if (severity) inputIssues[input.id] = severity;
			}

			return {
				...node,
				type: 'graphNode',
				selected: node.id === selectedNodeId,
				data: {
					...node.data,
					nodeIssue,
					inputIssues:
						Object.keys(inputIssues).length > 0 ? inputIssues : undefined
				}
			};
		});
		edges = flow.edges.map((edge) => ({
			...edge,
			selected: edge.id === selectedEdgeId,
			...(highlights.edges.has(edge.id)
				? { style: 'stroke: #f1948a; stroke-width: 2.5px;' }
				: {})
		}));
	});

	function onNodeClick({ node }: { node: Node }) {
		onselectedge?.(null);
		onselectnode?.(node.id);
	}

	function onEdgeClick({ edge }: { edge: Edge }) {
		onselectnode?.(null);
		onselectedge?.(edge.id);
	}

	function onPaneClick() {
		onselectnode?.(null);
		onselectedge?.(null);
	}

	function onNodeDragStop({ targetNode }: { targetNode: Node | null }) {
		if (!targetNode) return;
		onchange?.(
			applyEditIntent(graph, {
				kind: 'move-node',
				nodeId: targetNode.id,
				position: targetNode.position
			}),
			'Move node'
		);
	}

	function onConnect(connection: Connection) {
		if (
			!connection.source ||
			!connection.target ||
			!connection.sourceHandle ||
			!connection.targetHandle
		) {
			return;
		}

		const fromPort = portIdFromHandle(connection.sourceHandle);
		const toPort = portIdFromHandle(connection.targetHandle);
		if (!fromPort || !toPort) return;

		const from = { node: connection.source, port: fromPort };
		const to = { node: connection.target, port: toPort };
		const validation = validateConnection(graph, from, to);
		if (!validation.ok) return;

		onchange?.(applyEditIntent(graph, { kind: 'add-edge', from, to }), 'Add edge');
	}

	function isValidConnection(connection: Connection) {
		if (
			!connection.source ||
			!connection.target ||
			!connection.sourceHandle ||
			!connection.targetHandle
		) {
			return false;
		}
		const fromPort = portIdFromHandle(connection.sourceHandle);
		const toPort = portIdFromHandle(connection.targetHandle);
		if (!fromPort || !toPort) return false;
		return validateConnection(
			graph,
			{ node: connection.source, port: fromPort },
			{ node: connection.target, port: toPort }
		).ok;
	}

	function onPaletteDrop(primitiveId: string, position: { x: number; y: number }) {
		const result = resolvePaletteDrop(graph, primitiveId, position);
		onchange?.(result.next, result.historyLabel);
	}
</script>

<div class="canvas">
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		{isValidConnection}
		fitView
		onconnect={onConnect}
		onnodeclick={onNodeClick}
		onedgeclick={onEdgeClick}
		onpaneclick={onPaneClick}
		onnodedragstop={onNodeDragStop}
	>
		<Background />
		<Controls />
		<CanvasFitViewBridge onregister={onregisterfitview} />
		<CanvasPaletteDropBridge ondrop={onPaletteDrop} />
	</SvelteFlow>
</div>

<style>
	.canvas {
		width: 100%;
		height: 100%;
	}
</style>
