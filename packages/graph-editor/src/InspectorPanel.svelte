<script lang="ts">
	import { getPrimitive, type GraphDocument } from '@virtual-planet/graph';
	import { Value } from '@virtual-planet/schema';
	import ParamForm from './ParamForm.svelte';
	import PortBindingList from './PortBindingList.svelte';
	import { applyEditIntent } from './irAdapter.js';
	import { resolveNodeInspectorHelp } from './nodeInspectorHelp.js';
	import { derivePortBindings } from './portBindings.js';

	interface Props {
		graph: GraphDocument;
		nodeId: string | null;
		onchange?: (next: GraphDocument) => void;
	}

	let { graph, nodeId, onchange }: Props = $props();

	const node = $derived(nodeId ? graph.nodes.find((candidate) => candidate.id === nodeId) : undefined);
	const primitive = $derived(node ? getPrimitive(node.primitive) : undefined);
	const paramValue = $derived.by(() => {
		if (!node || !primitive) return {};
		const defaults = Value.Create(primitive.params) as Record<string, unknown>;
		return { ...defaults, ...(node.params ?? {}) };
	});
	const bindings = $derived(nodeId ? derivePortBindings(graph, nodeId) : []);
	const inspectorHelp = $derived(primitive ? resolveNodeInspectorHelp(primitive) : null);
</script>

<div class="inspector">
	{#if !node || !primitive}
		<p class="empty">Select a node to inspect parameters and inputs.</p>
	{:else}
		<h2 class="title">{primitive.id}</h2>
		{#if inspectorHelp?.summary}
			<p class="help">{inspectorHelp.summary}</p>
		{/if}
		{#if inspectorHelp?.usage}
			<p class="usage">{inspectorHelp.usage}</p>
		{/if}
		<PortBindingList {bindings} />
		<h3 class="heading">Parameters</h3>
		<ParamForm
			schema={primitive.params}
			value={paramValue}
			onchange={(next) => {
				if (!nodeId) return;
				onchange?.(applyEditIntent(graph, { kind: 'set-params', nodeId, params: next }));
			}}
		/>
	{/if}
</div>

<style>
	.inspector {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 8px;
		height: 100%;
		overflow: auto;
	}

	.title {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}

	.help,
	.usage {
		margin: 0;
		font-size: 11px;
		line-height: 1.45;
		opacity: 0.85;
	}

	.usage {
		opacity: 0.7;
		font-style: italic;
	}

	.heading {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
		opacity: 0.8;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.empty {
		margin: 0;
		font-size: 12px;
		opacity: 0.6;
	}
</style>
