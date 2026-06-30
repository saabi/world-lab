<script lang="ts">
	import { evaluateGraphOutput } from '@virtual-planet/runtime-cpu';
	import type { GraphDocument, PortRef } from '@virtual-planet/graph';

	import { fullValidation, incompleteGraphMessage } from './graphValidation.js';

	interface Props {
		graph: GraphDocument;
		output: PortRef | null;
		size?: number;
		refreshEpoch?: number;
		compileSignature?: string;
	}

	let { graph, output, size = 64, refreshEpoch = 0, compileSignature = '' }: Props = $props();

	const blockMessage = $derived(incompleteGraphMessage(fullValidation(graph)));

	let canvas = $state<HTMLCanvasElement | null>(null);

	$effect(() => {
		void refreshEpoch;
		void compileSignature;
		void graph;
		if (!canvas || !output || blockMessage) return;

		const context = canvas.getContext('2d');
		if (!context) return;

		const image = context.createImageData(size, size);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const u = x / (size - 1);
				const v = y / (size - 1);
				let scalar = 0;
				try {
					scalar = evaluateGraphOutput(graph, output, { procedural: { uv: [u, v] } });
				} catch {
					scalar = 0;
				}
				const byte = Math.max(0, Math.min(255, Math.round(scalar * 255)));
				const index = (y * size + x) * 4;
				image.data[index] = byte;
				image.data[index + 1] = byte;
				image.data[index + 2] = byte;
				image.data[index + 3] = 255;
			}
		}
		context.putImageData(image, 0, 0);
	});
</script>

<div class="preview">
	<h2 class="title">CPU preview</h2>
	{#if blockMessage}
		<p class="blocked">{blockMessage}</p>
	{:else if output}
		<canvas bind:this={canvas} width={size} height={size} class="heatmap"></canvas>
	{:else}
		<p class="empty">Wire a scalar output to preview.</p>
	{/if}
</div>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
		height: 100%;
		align-items: center;
	}

	.title {
		margin: 0;
		align-self: flex-start;
		font-size: 12px;
		font-weight: 600;
	}

	.heatmap {
		width: min(100%, 256px);
		height: auto;
		image-rendering: pixelated;
		border: 1px solid rgba(255, 255, 255, 0.12);
	}

	.empty,
	.blocked {
		margin: 0;
		font-size: 11px;
		opacity: 0.6;
	}

	.blocked {
		color: #f1948a;
		opacity: 1;
		align-self: flex-start;
	}
</style>
