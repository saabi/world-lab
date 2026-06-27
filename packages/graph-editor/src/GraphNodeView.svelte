<script module lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { getPrimitive } from '@virtual-planet/graph';
	import type { FlowNodeData } from './irAdapter.js';
</script>

<script lang="ts">
	let { data, selected }: NodeProps = $props();

	const nodeData = $derived(data as FlowNodeData);
	const primitive = $derived(getPrimitive(nodeData.primitiveId));
</script>

{#if primitive}
	<div class="graph-node" class:selected>
		<div class="label">{nodeData.label}</div>
		<div class="ports">
			<div class="inputs">
				{#each primitive.inputs as input (input.name)}
					<div class="port in">
						<Handle
							type="target"
							position={Position.Left}
							id={input.name}
							style="top: auto; position: relative; transform: none;"
						/>
						<span>{input.name}</span>
						<span class="type">{input.dataType}</span>
					</div>
				{/each}
			</div>
			<div class="outputs">
				{#each primitive.outputs as output (output.name)}
					<div class="port out">
						<span class="type">{output.dataType}</span>
						<span>{output.name}</span>
						<Handle
							type="source"
							position={Position.Right}
							id={output.name}
							style="top: auto; position: relative; transform: none;"
						/>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.graph-node {
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

	.label {
		font-weight: 600;
		margin-bottom: 6px;
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
