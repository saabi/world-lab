<script lang="ts">
	import { validateGraph, type GraphDocument } from '@virtual-planet/graph';

	interface Props {
		graph: GraphDocument;
	}

	let { graph }: Props = $props();

	const result = $derived(validateGraph(graph));
</script>

<div class="validation">
	<h2 class="title">Validation</h2>
	{#if result.ok}
		<p class="ok">Graph is valid.</p>
	{:else}
		<ul class="issues">
			{#each result.issues as issue, index (index)}
				<li>{issue.kind}{'edge' in issue ? ` (${issue.edge})` : ''}</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.validation {
		padding: 8px;
		height: 100%;
		overflow: auto;
	}

	.title {
		margin: 0 0 6px;
		font-size: 12px;
		font-weight: 600;
	}

	.ok {
		margin: 0;
		font-size: 11px;
		color: #7dcea0;
	}

	.issues {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 11px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
</style>
