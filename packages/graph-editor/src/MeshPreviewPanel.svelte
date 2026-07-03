<script lang="ts">
	import {
		renderSurfaceMeshPreview,
		requestGpuDevice,
		type SurfacePrimitiveId
	} from '@world-lab/runtime-webgpu';

	interface Props {
		size?: number;
		refreshEpoch?: number;
		compileSignature?: string;
	}

	let { size = 256, refreshEpoch = 0, compileSignature = '' }: Props = $props();

	let surfaceId = $state<SurfacePrimitiveId>('surface.cubeSphere');

	let canvas = $state<HTMLCanvasElement | null>(null);
	let statusMessage = $state<string | null>(null);

	const webGpuAvailable =
		typeof navigator !== 'undefined' && typeof navigator.gpu !== 'undefined';

	$effect(() => {
		void refreshEpoch;
		void compileSignature;
		void surfaceId;
		if (!canvas) return;

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

				await renderSurfaceMeshPreview({
					device,
					canvas,
					surfaceId,
					gridSize: 24
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
	<div class="surface-toggle" role="tablist" aria-label="Surface mapping">
		<button
			type="button"
			role="tab"
			aria-selected={surfaceId === 'surface.plane'}
			class:active={surfaceId === 'surface.plane'}
			onclick={() => (surfaceId = 'surface.plane')}
		>
			Plane
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={surfaceId === 'surface.cubeSphere'}
			class:active={surfaceId === 'surface.cubeSphere'}
			onclick={() => (surfaceId = 'surface.cubeSphere')}
		>
			Cube-sphere
		</button>
	</div>
	<canvas bind:this={canvas} width={size} height={size} class="mesh"></canvas>
	{#if statusMessage}
		<p class="status">{statusMessage}</p>
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

	.surface-toggle {
		display: flex;
		gap: 4px;
		align-self: flex-start;
	}

	.surface-toggle button {
		font-size: 10px;
		padding: 3px 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
		opacity: 0.7;
	}

	.surface-toggle button.active {
		opacity: 1;
		border-color: rgba(255, 255, 255, 0.35);
		background: #24304a;
	}

	.surface-toggle button:hover {
		border-color: rgba(255, 255, 255, 0.3);
	}

	.mesh {
		width: min(100%, 256px);
		height: auto;
		border: 1px solid rgba(255, 255, 255, 0.12);
	}

	.status {
		margin: 0;
		font-size: 11px;
		opacity: 0.7;
		text-align: center;
	}
</style>
