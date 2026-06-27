<script lang="ts">
	import type { PortBindingState } from './types.js';

	interface Props {
		bindings: PortBindingState[];
	}

	let { bindings }: Props = $props();

	function sourceLabel(binding: PortBindingState): string {
		switch (binding.source.kind) {
			case 'edge':
				return `${binding.source.fromNode}.${binding.source.fromPort}`;
			case 'host':
				return `Host: ${binding.source.inputId}`;
			case 'unconnected':
				if (binding.dataType === 'image' || binding.dataType === 'mesh' || binding.dataType === 'audio') {
					return 'Bind asset… (M14)';
				}
				return 'Unconnected';
		}
	}
</script>

<div class="port-bindings">
	<h3 class="heading">Inputs</h3>
	{#if bindings.length === 0}
		<p class="empty">No input ports.</p>
	{:else}
		{#each bindings as binding (binding.portId)}
			<div class="row">
				<span class="name">{binding.name}</span>
				<span class="type">{binding.dataType}</span>
				<span class="source">{sourceLabel(binding)}</span>
			</div>
		{/each}
	{/if}
</div>

<style>
	.port-bindings {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.heading {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
		opacity: 0.8;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr auto 1.2fr;
		gap: 6px;
		font-size: 11px;
		align-items: center;
	}

	.name {
		font-weight: 500;
	}

	.type {
		opacity: 0.65;
		font-family: monospace;
	}

	.source {
		opacity: 0.85;
		text-align: right;
	}

	.empty {
		margin: 0;
		font-size: 11px;
		opacity: 0.55;
	}
</style>
