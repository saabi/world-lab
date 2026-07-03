<script lang="ts">
	import type { GraphDocument, PortRef } from '@world-lab/graph';

	interface Props {
		graph: GraphDocument;
		output: PortRef | null;
		refreshEpoch?: number;
		compileSignature?: string;
	}

	let { graph, output, refreshEpoch = 0, compileSignature = '' }: Props = $props();
</script>

<div class="audio-preview">
	<p class="hint">
		{#if output}
			Audio output from <code>{output.node}.{output.port}</code> — playback is not wired yet.
		{:else}
			Select an audio output buffer to preview.
		{/if}
	</p>
	<audio controls aria-label="Graph audio preview placeholder"></audio>
	<p class="meta">Graph nodes: {graph.nodes.length} · refresh {refreshEpoch} · sig {compileSignature.slice(0, 8)}</p>
</div>

<style>
	.audio-preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		font-size: 12px;
		color: #dbe4ff;
	}

	.hint {
		margin: 0;
		opacity: 0.75;
		line-height: 1.4;
	}

	code {
		font-family: ui-monospace, monospace;
		font-size: 11px;
	}

	audio {
		width: 100%;
	}

	.meta {
		margin: 0;
		font-size: 10px;
		opacity: 0.45;
	}
</style>
