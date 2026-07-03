<script module lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import {
		compatibleConsumers,
		compatibleProducers,
		type PortMatch
	} from '@world-lab/graph';
	import type { FlowNodeData } from './irAdapter.js';
</script>

<script lang="ts">
	import NodeSwapMenu from './NodeSwapMenu.svelte';
	import PortConnectMenu from './PortConnectMenu.svelte';
	import { getGraphCanvasContext } from './graphCanvasContext.js';
	import { nodeAccentColor } from './nodeAccentColor.js';
	import { inputHandleId, outputHandleId } from './portHandles.js';

	const CONNECT_OFFSET_X = 220;

	let { id, data, selected, position }: NodeProps = $props();

	const nodeData = $derived(data as FlowNodeData);
	const canvasContext = getGraphCanvasContext();
	const accentColor = $derived(
		nodeAccentColor(nodeData.primitiveId, canvasContext.getNodeColorMode())
	);

	let menuOpen = $state(false);
	let titlePointerDown: { x: number; y: number } | null = $state(null);

	type ConnectMenuState = {
		portId: string;
		direction: 'in' | 'out';
		matches: PortMatch[];
	};

	let connectMenu = $state<ConnectMenuState | null>(null);

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
		connectMenu = null;
		menuOpen = !menuOpen;
	}

	function onTitleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			event.stopPropagation();
			connectMenu = null;
			menuOpen = !menuOpen;
		}
	}

	function closeMenu() {
		menuOpen = false;
	}

	function closeConnectMenu() {
		connectMenu = null;
	}

	function replacePrimitive(primitiveId: string) {
		canvasContext.onReplacePrimitive(id, primitiveId);
	}

	function openConnectMenu(portId: string, direction: 'in' | 'out', dataType: string) {
		menuOpen = false;
		const matches =
			direction === 'out' ? compatibleConsumers(dataType) : compatibleProducers(dataType);
		connectMenu = { portId, direction, matches };
	}

	function onPortContextMenu(
		event: MouseEvent,
		portId: string,
		direction: 'in' | 'out',
		dataType: string
	) {
		event.preventDefault();
		event.stopPropagation();
		openConnectMenu(portId, direction, dataType);
	}

	function onPortKeydown(
		event: KeyboardEvent,
		portId: string,
		direction: 'in' | 'out',
		dataType: string
	) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		event.stopPropagation();
		openConnectMenu(portId, direction, dataType);
	}

	function portAriaLabel(direction: 'in' | 'out', name: string, dataType: string): string {
		const role = direction === 'in' ? 'Input' : 'Output';
		return `${role} port ${name}, ${dataType}`;
	}

	function connectPrimitive(primitiveId: string) {
		if (!connectMenu) return;
		const nodePosition = position ?? { x: 0, y: 0 };
		const placement =
			connectMenu.direction === 'out'
				? { x: nodePosition.x + CONNECT_OFFSET_X, y: nodePosition.y }
				: { x: nodePosition.x - CONNECT_OFFSET_X, y: nodePosition.y };
		canvasContext.onAddConnectedNode({
			source: { node: id, port: connectMenu.portId },
			sourceDirection: connectMenu.direction,
			primitiveId,
			position: placement
		});
		closeConnectMenu();
	}
</script>

<div
	class="graph-node"
	class:selected
	class:has-accent={accentColor !== null && !nodeData.nodeIssue}
	class:issue-error={nodeData.nodeIssue === 'error'}
	class:issue-warning={nodeData.nodeIssue === 'warning'}
	style:--node-accent={accentColor ?? undefined}
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
		{#if nodeData.label !== nodeData.primitiveId}
			<div class="primitive-id">{nodeData.primitiveId}</div>
		{/if}
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
				<div class="port-wrap">
					<div
						class="port in"
						class:issue-error={nodeData.inputIssues?.[input.id] === 'error'}
						class:issue-warning={nodeData.inputIssues?.[input.id] === 'warning'}
						role="button"
						tabindex="0"
						aria-label={portAriaLabel('in', input.name, input.dataType)}
						oncontextmenu={(event) =>
							onPortContextMenu(event, input.id, 'in', input.dataType)}
						onkeydown={(event) =>
							onPortKeydown(event, input.id, 'in', input.dataType)}
					>
						<Handle
							type="target"
							position={Position.Left}
							id={inputHandleId(input.id)}
							style="top: auto; position: relative; transform: none;"
						/>
						<span>{input.name}</span>
						<span class="type">{input.dataType}</span>
					</div>
					{#if connectMenu?.portId === input.id && connectMenu.direction === 'in'}
						<PortConnectMenu
							matches={connectMenu.matches}
							onselect={connectPrimitive}
							onclose={closeConnectMenu}
						/>
					{/if}
				</div>
			{/each}
		</div>
		<div class="outputs">
			{#each nodeData.outputs as output (output.id)}
				<div class="port-wrap">
					<div
						class="port out"
						role="button"
						tabindex="0"
						aria-label={portAriaLabel('out', output.name, output.dataType)}
						oncontextmenu={(event) =>
							onPortContextMenu(event, output.id, 'out', output.dataType)}
						onkeydown={(event) =>
							onPortKeydown(event, output.id, 'out', output.dataType)}
					>
						<span class="type">{output.dataType}</span>
						<span>{output.name}</span>
						<Handle
							type="source"
							position={Position.Right}
							id={outputHandleId(output.id)}
							style="top: auto; position: relative; transform: none;"
						/>
					</div>
					{#if connectMenu?.portId === output.id && connectMenu.direction === 'out'}
						<PortConnectMenu
							matches={connectMenu.matches}
							onselect={connectPrimitive}
							onclose={closeConnectMenu}
						/>
					{/if}
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

	.graph-node.has-accent {
		border-left: 3px solid var(--node-accent);
		padding-left: 6px;
	}

	.graph-node.has-accent .label-wrap {
		background: color-mix(in srgb, var(--node-accent) 24%, #1f2433);
		border-radius: 4px;
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

	.primitive-id {
		margin-top: 2px;
		padding-left: 2px;
		font-family: monospace;
		font-size: 9px;
		opacity: 0.45;
	}

	.ports {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.port-wrap {
		position: relative;
	}

	.port {
		display: flex;
		align-items: center;
		gap: 4px;
		cursor: context-menu;
		border-radius: 3px;
	}

	.port:focus {
		outline: 1px solid rgba(93, 140, 255, 0.65);
		outline-offset: 2px;
	}

	.port:focus:not(:focus-visible) {
		outline: none;
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
