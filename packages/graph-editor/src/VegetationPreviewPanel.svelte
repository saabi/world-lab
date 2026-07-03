<script lang="ts">
	import type { GraphDocument, PortRef } from '@world-lab/graph';
	import {
		renderVegetationPreview,
		requestGpuDevice,
		type VegetationPreviewMode,
		type VegetationCandidateGpuRecord
	} from '@world-lab/runtime-webgpu';

	interface Props {
		graph: GraphDocument;
		refreshEpoch?: number;
		compileSignature?: string;
	}

	let { graph, refreshEpoch = 0, compileSignature = '' }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let statusMessage = $state<string | null>(null);
	let altitudeMeters = $state<number>(100);

	// Find outputs in graph to bind
	let densityOutputName = $state<string>('');
	let placementOutputName = $state<string>('');

	let mode = $state<VegetationPreviewMode>('none');
	let candidateCount = $state<number>(0);
	let overflowed = $state<boolean>(false);

	const webGpuAvailable =
		typeof navigator !== 'undefined' && typeof navigator.gpu !== 'undefined';

	// Auto-select outputs based on data types
	$effect(() => {
		const outputs = graph.outputs || [];
		if (outputs.length > 0) {
			// Find first output of type vec3f (or guess if not typed) for density
			if (!densityOutputName) {
				const densityCandidate = outputs.find(out => {
					const node = graph.nodes.find(n => n.id === out.from.node);
					const port = node?.outputs.find(p => p.id === out.from.port);
					return port?.dataType === 'vec3f';
				}) || outputs[0];
				densityOutputName = densityCandidate?.name || '';
			}

			// Find first output of type f32 (or guess if not typed) for placement
			if (!placementOutputName) {
				const placementCandidate = outputs.find(out => {
					const node = graph.nodes.find(n => n.id === out.from.node);
					const port = node?.outputs.find(p => p.id === out.from.port);
					return port?.dataType === 'f32';
				}) || outputs[outputs.length - 1];
				placementOutputName = placementCandidate?.name || '';
			}
		}
	});

	$effect(() => {
		void refreshEpoch;
		void compileSignature;
		void densityOutputName;
		void placementOutputName;
		void altitudeMeters;
		void graph;

		if (!canvas) return;

		if (!webGpuAvailable) {
			statusMessage = 'WebGPU is not available in this browser.';
			return;
		}

		const outputs = graph.outputs || [];
		const densityOut = outputs.find((out) => out.name === densityOutputName);
		const placementOut = outputs.find((out) => out.name === placementOutputName);

		if (!densityOut || !placementOut) {
			statusMessage = 'Please select valid Density and Placement outputs.';
			return;
		}

		let cancelled = false;
		statusMessage = 'Rendering…';

		// Constant preview patch (10m x 10m)
		const patch = {
			id: 'preview-patch',
			origin: [0, 0, 0] as const,
			tangentX: [1, 0, 0] as const,
			tangentY: [0, 0, 1] as const, // orthogonal XZ plane
			widthMeters: 16,
			heightMeters: 16
		};

		// Config matching test configs
		const config = {
			spacingMeters: 1.0,
			channel: 0 as const,
			placementThreshold: 0.4,
			densityThreshold: 0.1,
			minProminence: 0.05
		};

		void (async () => {
			try {
				const { device } = await requestGpuDevice();
				if (cancelled) return;

				const result = await renderVegetationPreview({
					device,
					canvas,
					patch,
					config,
					density: { graph, output: densityOut.from },
					placement: { graph, output: placementOut.from },
					altitudeMeters
				});

				if (cancelled) return;
				mode = result.mode;
				candidateCount = result.candidateCount;
				overflowed = result.overflowed;
				statusMessage = null;
			} catch (error) {
				if (cancelled) return;
				statusMessage = error instanceof Error ? error.message : 'Vegetation preview failed.';
			}
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

<div class="preview">
	<div class="controls">
		<label class="control-row">
			<span>Density (vec3f):</span>
			<select bind:value={densityOutputName}>
				<option value="">-- Select Density --</option>
				{#each graph.outputs || [] as output}
					<option value={output.name}>{output.name}</option>
				{/each}
			</select>
		</label>

		<label class="control-row">
			<span>Placement (f32):</span>
			<select bind:value={placementOutputName}>
				<option value="">-- Select Placement --</option>
				{#each graph.outputs || [] as output}
					<option value={output.name}>{output.name}</option>
				{/each}
			</select>
		</label>

		<label class="control-row slider-row">
			<span>Simulated Altitude: {altitudeMeters}m</span>
			<input
				type="range"
				min="10"
				max="2500"
				step="10"
				bind:value={altitudeMeters}
			/>
		</label>
	</div>

	<div class="canvas-container">
		<canvas bind:this={canvas} width="256" height="256" class="viewport"></canvas>
		{#if statusMessage}
			<p class="status">{statusMessage}</p>
		{/if}
	</div>

	<div class="stats">
		<div class="stat-item">
			<span class="label">LOD Mode:</span>
			<span class="value mode-val">{mode.toUpperCase()}</span>
		</div>
		{#if mode === 'impostor' || mode === 'full'}
			<div class="stat-item">
				<span class="label">Candidates:</span>
				<span class="value">{candidateCount} {overflowed ? '(Overflowed)' : ''}</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
		height: 100%;
		color: #dbe4ff;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		background: rgba(255, 255, 255, 0.03);
		padding: 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.control-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 10px;
	}

	.control-row select {
		font-size: 10px;
		padding: 2px 4px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 3px;
		background: #1a1f30;
		color: #dbe4ff;
		width: 120px;
	}

	.slider-row {
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		margin-top: 4px;
	}

	.slider-row input {
		width: 100%;
		margin: 0;
	}

	.canvas-container {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
		flex: 1;
		min-height: 0;
	}

	.viewport {
		width: min(100%, 256px);
		height: auto;
		border: 1px solid rgba(255, 255, 255, 0.12);
	}

	.status {
		position: absolute;
		background: rgba(13, 16, 24, 0.8);
		padding: 4px 8px;
		border-radius: 4px;
		margin: 0;
		font-size: 10px;
		opacity: 0.9;
		text-align: center;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.stats {
		display: flex;
		justify-content: space-around;
		font-size: 10px;
		background: rgba(255, 255, 255, 0.02);
		padding: 4px;
		border-radius: 4px;
	}

	.stat-item {
		display: flex;
		gap: 4px;
	}

	.stat-item .label {
		opacity: 0.7;
	}

	.stat-item .mode-val {
		font-weight: bold;
		color: #7aa2ff;
	}
</style>
