<script lang="ts">
	import type { GraphDocument } from '@world-lab/graph';
	import { renderMeshGenPreview, requestGpuDevice, type MeshGenRequest } from '@world-lab/runtime-webgpu';

	import type { MeshTargetDescriptor } from './previewBuffers.js';

	interface Props {
		graph: GraphDocument;
		meshRequest: MeshTargetDescriptor | null;
		size?: number;
		refreshEpoch?: number;
		compileSignature?: string;
	}

	let {
		graph,
		meshRequest,
		size = 256,
		refreshEpoch = 0,
		compileSignature = ''
	}: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let statusMessage = $state<string | null>(null);

	const webGpuAvailable =
		typeof navigator !== 'undefined' && typeof navigator.gpu !== 'undefined';

	function buildMeshGenRequest(descriptor: MeshTargetDescriptor): MeshGenRequest {
		return {
			graph,
			position: descriptor.position,
			normal: descriptor.normal,
			gridSize: descriptor.gridSize,
			faceCount: descriptor.faceCount
		};
	}

	$effect(() => {
		void refreshEpoch;
		void compileSignature;
		void graph;
		void meshRequest;
		if (!canvas || !meshRequest) return;

		if (!webGpuAvailable) {
			statusMessage = 'WebGPU is not available in this browser.';
			return;
		}

		let cancelled = false;
		statusMessage = 'Rendering…';

		void (async () => {
			try {
				const { device } = await requestGpuDevice();
				if (cancelled) return;

				await renderMeshGenPreview({
					device,
					canvas,
					request: buildMeshGenRequest(meshRequest)
				});
				if (cancelled) return;
				statusMessage = null;
			} catch (error) {
				if (cancelled) return;
				statusMessage = error instanceof Error ? error.message : 'Mesh preview failed.';
			}
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

<div class="preview">
	{#if !meshRequest}
		<p class="empty">Wire a mesh target — add target.mesh and connect position and normal fields.</p>
	{:else}
		<canvas bind:this={canvas} width={size} height={size} class="mesh" aria-label="Mesh preview"></canvas>
		{#if statusMessage}
			<p class="status">{statusMessage}</p>
		{/if}
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
		justify-content: center;
	}

	.mesh {
		width: min(100%, 256px);
		height: auto;
		border: 1px solid rgba(255, 255, 255, 0.12);
	}

	.status,
	.empty {
		margin: 0;
		font-size: 11px;
		opacity: 0.7;
		text-align: center;
	}

	.empty {
		padding: 12px;
		align-self: stretch;
	}
</style>
