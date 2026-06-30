<script module lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import type { FlowNodeData } from './irAdapter.js';
</script>

<script lang="ts">
	import NodeSwapMenu from './NodeSwapMenu.svelte';
	import { getGraphCanvasContext } from './graphCanvasContext.js';

	let { id, data, selected }: NodeProps = $props();

	const nodeData = $derived(data as FlowNodeData);
	const canvasContext = getGraphCanvasContext();

	let menuOpen = $state(false);
	let titlePointerDown: { x: number; y: number } | null = $state(null);

	function onTitlePointerDown(event: PointerEvent) {
		titlePointerDown = { x: event.clientX, y: event.clientY };
	}

	function onTitlePointerUp(event: PointerEvent) {
		if (!titlePointerDown) return;
		const dx = event.clientX - titlePointerDown.x;
		const dy = event.clientY - titlePointerDown.y;
		titlePointerDown = null;
		if (dx * dx + dy * dy > 9) return;
		event.stopPropagation();
		menuOpen = !menuOpen;
	}

	function onTitleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			event.stopPropagation();
			menuOpen = !menuOpen;
		}
	}

	function closeMenu() {
		menuOpen = false;
	}

	function replacePrimitive(primitiveId: string) {
		canvasContext.onReplacePrimitive(id, primitiveId);
	}
</script>

<div
	class="graph-node"
	class:selected
	class:issue-error={nodeData.nodeIssue === 'error'}
	class:issue-warning={nodeData.nodeIssue === 'warning'}
>
	<div class="label-wrap">
		<button
			class="label nodrag nopan"
			type="button"
			title="Change operation"
			aria-expanded={menuOpen}
			aria-haspopup="dialog"
			onpointerdown={onTitlePointerDown}
			onpointerup={onTitlePointerUp}
			onkeydown={onTitleKeydown}
		>
			<span class="label-text">{nodeData.label}</span>
			<span class="caret" aria-hidden="true">▾</span>
		</button>
		{#if menuOpen}
			<NodeSwapMenu
				currentPrimitiveId={nodeData.primitiveId}
				onselect={replacePrimitive}
				onclose={closeMenu}
			/>
		{/if}
	</div>
	<div class="ports">
		<div class="inputs">
			{#each nodeData.inputs as input (input.id)}
				<div
					class="port in"
					class:issue-error={nodeData.inputIssues?.[input.id] === 'error'}
					class:issue-warning={nodeData.inputIssues?.[input.id] === 'warning'}
				>
					<Handle
						type="target"
						position={Position.Left}
						id={input.id}
						style="top: auto; position: relative; transform: none;"
					/>
					<span>{input.name}</span>
					<span class="type">{input.dataType}</span>
				</div>
			{/each}
		</div>
		<div class="outputs">
			{#each nodeData.outputs as output (output.id)}
				<div class="port out">
					<span class="type">{output.dataType}</span>
					<span>{output.name}</span>
					<Handle
						type="source"
						position={Position.Right}
						id={output.id}
						style="top: auto; position: relative; transform: none;"
					/>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.graph-node {
		position: relative;
		min-width: 160px;
		padding: 8px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 6px;
		background: #1f2433;
		color: #eef2ff;
		font-size: 11px;
	}

	.graph-node.selected {
		border-color: #5d8cff;
		box-shadow: 0 0 0 1px rgba(93, 140, 255, 0.35);
	}

	.graph-node.issue-error {
		border-color: #f1948a;
		box-shadow: 0 0 0 1px rgba(241, 148, 138, 0.45);
	}

	.graph-node.issue-warning {
		border-color: #f7dc6f;
		box-shadow: 0 0 0 1px rgba(247, 220, 111, 0.35);
	}

	.port.issue-error {
		color: #f1948a;
	}

	.port.issue-warning {
		color: #f7dc6f;
	}

	.label-wrap {
		position: relative;
		margin-bottom: 6px;
	}

	.label {
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
	}

	.label:hover .label-text {
		text-decoration: underline;
		text-decoration-color: rgba(255, 255, 255, 0.35);
	}

	.caret {
		font-size: 9px;
		opacity: 0.55;
	}

	.ports {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.port {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.port.in {
		justify-content: flex-start;
	}

	.port.out {
		justify-content: flex-end;
	}

	.type {
		opacity: 0.55;
		font-family: monospace;
		font-size: 10px;
	}
</style>
