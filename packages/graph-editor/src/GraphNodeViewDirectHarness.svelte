<script lang="ts">
	import GraphNodeView from './GraphNodeView.svelte';
	import { setGraphCanvasContext } from './graphCanvasContext.js';
	import type { FlowNodeData } from './irAdapter.js';

	interface Props {
		data: FlowNodeData;
		nodeId?: string;
		position?: { x: number; y: number };
		onAddConnectedNode?: (args: {
			source: { node: string; port: string };
			sourceDirection: 'in' | 'out';
			primitiveId: string;
			position: { x: number; y: number };
		}) => void;
	}

	let {
		data,
		nodeId = 'n1',
		position = { x: 100, y: 100 },
		onAddConnectedNode = () => {}
	}: Props = $props();

	setGraphCanvasContext({
		onReplacePrimitive: () => {},
		onAddConnectedNode,
		getNodeColorMode: () => 'category'
	});
</script>

<GraphNodeView id={nodeId} {data} selected={false} {position} />
