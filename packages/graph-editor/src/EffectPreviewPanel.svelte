<script lang="ts">
	import type { GraphDocument, PortRef } from '@virtual-planet/graph';

	import { fullValidation, incompleteGraphMessage } from './graphValidation.js';
	import {
		blitPreviewPixels,
		type PreviewFrameLoop,
		type PreviewPointer
	} from './previewFrameLoop.js';

	interface Props {
		graph: GraphDocument;
		output: PortRef | null;
		targetId: string | null;
		frameLoop: PreviewFrameLoop | null;
		size?: number;
	}

	let { graph, output, targetId, frameLoop, size = 256 }: Props = $props();

	const blockMessage = $derived(incompleteGraphMessage(fullValidation(graph)));

	let canvas = $state<HTMLCanvasElement | null>(null);
	let statusMessage = $state<string | null>(null);
	let pointer = $state<PreviewPointer>([0, 0, 0, 0]);

	function onPointerMove(event: PointerEvent) {
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const x = (event.clientX - rect.left) / rect.width;
		const y = (event.clientY - rect.top) / rect.height;
		const click = event.buttons > 0 ? 1 : 0;
		pointer = [x, y, click, 0];
		if (targetId && frameLoop) {
			frameLoop.setPointer(targetId, pointer);
		}
	}

	function onPointerDown(event: PointerEvent) {
		onPointerMove(event);
	}

	function onPointerUp() {
		pointer = [pointer[0], pointer[1], 0, 0];
		if (targetId && frameLoop) {
			frameLoop.setPointer(targetId, pointer);
		}
	}

	$effect(() => {
		void graph;
		void output;
		void targetId;
		void frameLoop;

		if (!canvas || !output || !targetId || !frameLoop || blockMessage) {
			statusMessage = null;
			return;
		}

		statusMessage = 'Rendering…';
		const unsubscribe = frameLoop.subscribe((snapshot) => {
			if (snapshot.error) {
				statusMessage = snapshot.error;
				return;
			}
			const pixels = snapshot.targets[targetId];
			if (!pixels || !canvas) return;
			statusMessage = null;
			blitPreviewPixels(canvas, snapshot.width, snapshot.height, pixels);
		});

		return unsubscribe;
	});
</script>

<div
	class="preview"
	role="img"
	aria-label="ShaderToy fragment effect preview"
	onpointermove={onPointerMove}
	onpointerdown={onPointerDown}
	onpointerup={onPointerUp}
	onpointerleave={onPointerUp}
>
	<h2 class="title">Effect preview</h2>
	<p class="hint">Animation clock is shared across preview panes; pointer is local to this pane.</p>
	{#if blockMessage}
		<p class="blocked">{blockMessage}</p>
	{:else if output && targetId && frameLoop}
		<canvas bind:this={canvas} width={size} height={size} class="effect-canvas"></canvas>
		{#if statusMessage}
			<p class="status">{statusMessage}</p>
		{/if}
	{:else if output}
		<p class="empty">Preview loop unavailable — wire a pipeline display target.</p>
	{:else}
		<p class="empty">Wire a vec4 image output with a fragment consumer.</p>
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

	.hint {
		margin: 0;
		align-self: flex-start;
		font-size: 10px;
		opacity: 0.55;
		line-height: 1.35;
	}

	.effect-canvas {
		width: min(100%, 320px);
		height: auto;
		image-rendering: pixelated;
		border: 1px solid rgba(255, 255, 255, 0.12);
		touch-action: none;
	}

	.status,
	.empty,
	.blocked {
		margin: 0;
		font-size: 11px;
		opacity: 0.7;
		text-align: center;
	}

	.blocked {
		color: #f1948a;
		opacity: 1;
		align-self: flex-start;
		text-align: left;
	}
</style>
