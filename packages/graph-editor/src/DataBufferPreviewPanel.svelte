<script lang="ts">
	import type { GraphDocument, PortRef } from '@world-lab/graph';

	import type { PreviewFrameLoop } from './previewFrameLoop.js';

	interface Props {
		graph: GraphDocument;
		output: PortRef | null;
		targetId: string | null;
		frameLoop: PreviewFrameLoop | null;
	}

	let { graph, output, targetId, frameLoop }: Props = $props();

	let values = $state<Float32Array | null>(null);
	let statusMessage = $state<string | null>(null);

	const previewValues = $derived(values ? Array.from(values.slice(0, 8)) : []);
	const lastValue = $derived(values && values.length > 0 ? values[values.length - 1] : null);

	$effect(() => {
		void graph;
		void output;
		void targetId;
		void frameLoop;

		values = null;
		if (!targetId || !frameLoop) {
			statusMessage = 'Preview loop unavailable.';
			return;
		}

		statusMessage = 'Waiting for buffer data.';
		const unsubscribe = frameLoop.subscribe((snapshot) => {
			if (snapshot.error) {
				statusMessage = snapshot.error;
				return;
			}
			const next = snapshot.computeBuffers?.[targetId];
			if (!next) return;
			values = next;
			statusMessage = null;
		});

		return unsubscribe;
	});
</script>

<div class="buffer-preview" data-testid="data-buffer-preview">
	{#if values}
		<div class="summary">
			<span>{values.length} values</span>
			<span>last {lastValue}</span>
		</div>
		<ol class="values" aria-label="Buffer values">
			{#each previewValues as value, index}
				<li><span>{index}</span><strong>{value}</strong></li>
			{/each}
		</ol>
	{:else}
		<p class="status">{statusMessage}</p>
	{/if}
</div>

<style>
	.buffer-preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
		height: 100%;
		min-height: 0;
		font-size: 11px;
	}

	.summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 6px 8px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.04);
	}

	.values {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.values li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		background: #151924;
	}

	.values span {
		opacity: 0.55;
	}

	.values strong {
		font-weight: 600;
	}

	.status {
		margin: 0;
		opacity: 0.7;
	}
</style>
