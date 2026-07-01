<script lang="ts">
	import type { GraphDocument } from '@virtual-planet/graph';

	import AudioPreviewPanel from './AudioPreviewPanel.svelte';
	import CpuPreviewPanel from './CpuPreviewPanel.svelte';
	import EffectPreviewPanel from './EffectPreviewPanel.svelte';
	import GpuPreviewPanel from './GpuPreviewPanel.svelte';
	import MeshPreviewPanel from './MeshPreviewPanel.svelte';
	import VegetationPreviewPanel from './VegetationPreviewPanel.svelte';
	import { resolvePreviewRenderer, type PreviewRenderer } from './previewBackend.js';
	import {
		findPreviewBufferById,
		resolvePreviewBufferPort,
		type PreviewBuffer,
		type PreviewFamily
	} from './previewBuffers.js';
	import { resolvePaneBufferId, type PreviewPaneSelection } from './previewPaneSelection.js';
	import type { PreviewFrameLoop } from './previewFrameLoop.js';

	interface Props {
		paneId: string;
		graph: GraphDocument;
		buffers: PreviewBuffer[];
		selection: PreviewPaneSelection | undefined;
		defaultBufferId: string | null;
		frameLoop: PreviewFrameLoop | null;
		refreshEpoch: number;
		compileSignature: string;
		onSelectionChange: (selection: PreviewPaneSelection) => void;
	}

	let {
		paneId,
		graph,
		buffers,
		selection,
		defaultBufferId,
		frameLoop,
		refreshEpoch,
		compileSignature,
		onSelectionChange
	}: Props = $props();

	const bufferIds = $derived(new Set(buffers.map((buffer) => buffer.id)));
	const selectedBufferId = $derived(
		resolvePaneBufferId(selection, bufferIds, defaultBufferId)
	);
	const selectedBuffer = $derived(
		findPreviewBufferById(graph, selectedBufferId) ??
			(selectedBufferId ? buffers.find((buffer) => buffer.id === selectedBufferId) : null)
	);
	const previewOutput = $derived(
		selectedBuffer ? resolvePreviewBufferPort(graph, selectedBuffer) : null
	);
	const previewRenderer = $derived(
		resolvePreviewRenderer(selectedBuffer, {
			familyOverride: selection?.familyOverride ?? null,
			rendererOverride: selection?.rendererOverride ?? null
		})
	);

	function selectPreviewBuffer(bufferId: string) {
		onSelectionChange({ bufferId });
	}

	function setPreviewFamilyOverride(family: PreviewFamily) {
		const buffer = selectedBuffer;
		if (!buffer || !selectedBufferId) return;
		onSelectionChange({
			bufferId: selectedBufferId,
			familyOverride: family === buffer.family ? null : family,
			rendererOverride: null
		});
	}

	function setPreviewRenderer(renderer: PreviewRenderer) {
		if (!selectedBufferId) return;
		onSelectionChange({
			bufferId: selectedBufferId,
			familyOverride: selection?.familyOverride ?? null,
			rendererOverride: renderer
		});
	}
</script>

<div class="preview-zone" data-pane-id={paneId}>
	<div class="preview-buffer-bar" role="tablist" aria-label="Graph output buffers">
		{#if buffers.length === 0}
			<p class="preview-empty">No preview buffers — wire an output or pipeline display target.</p>
		{:else}
			{#each buffers as buffer (buffer.id)}
				<button
					type="button"
					role="tab"
					aria-selected={selectedBuffer?.id === buffer.id}
					class:active={selectedBuffer?.id === buffer.id}
					class="buffer-tab"
					onclick={() => selectPreviewBuffer(buffer.id)}
				>
					<span class="family-badge" data-family={buffer.family}>{buffer.family.slice(0, 1)}</span>
					<span class="buffer-label">{buffer.label}</span>
				</button>
			{/each}
		{/if}
	</div>
	{#if selectedBuffer && !selectedBuffer.inferred}
		<label class="family-override">
			<span>View as</span>
			<select
				value={selection?.familyOverride ?? selectedBuffer.family}
				onchange={(event) =>
					setPreviewFamilyOverride((event.currentTarget as HTMLSelectElement).value as PreviewFamily)}
			>
				<option value="data">data</option>
				<option value="image">image</option>
				<option value="geometry">geometry</option>
				<option value="audio">audio</option>
			</select>
		</label>
	{/if}
	{#if previewRenderer === 'cpu'}
		<CpuPreviewPanel
			{graph}
			output={previewOutput}
			refreshEpoch={refreshEpoch}
			{compileSignature}
		/>
	{:else if previewRenderer === 'gpu'}
		<GpuPreviewPanel
			{graph}
			output={previewOutput}
			refreshEpoch={refreshEpoch}
			{compileSignature}
		/>
	{:else if previewRenderer === 'mesh'}
		<MeshPreviewPanel refreshEpoch={refreshEpoch} {compileSignature} />
	{:else if previewRenderer === 'effect'}
		<EffectPreviewPanel
			{graph}
			output={previewOutput}
			targetId={selectedBufferId}
			{frameLoop}
		/>
	{:else if previewRenderer === 'audio'}
		<AudioPreviewPanel
			{graph}
			output={previewOutput}
			refreshEpoch={refreshEpoch}
			{compileSignature}
		/>
	{:else}
		<VegetationPreviewPanel {graph} refreshEpoch={refreshEpoch} {compileSignature} />
	{/if}
</div>

<style>
	.preview-zone {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.preview-buffer-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 6px 8px 0;
		flex: 0 0 auto;
	}

	.preview-empty {
		margin: 0;
		font-size: 10px;
		opacity: 0.65;
		padding: 2px 0 4px;
	}

	.buffer-tab {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		padding: 3px 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #1a1f30;
		color: inherit;
		cursor: pointer;
		opacity: 0.75;
	}

	.buffer-tab.active {
		opacity: 1;
		border-color: rgba(255, 255, 255, 0.35);
		background: #24304a;
	}

	.buffer-tab:hover {
		border-color: rgba(255, 255, 255, 0.3);
	}

	.family-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border-radius: 3px;
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		background: rgba(255, 255, 255, 0.12);
	}

	.family-badge[data-family='image'] {
		background: rgba(120, 180, 255, 0.25);
	}

	.family-badge[data-family='geometry'] {
		background: rgba(140, 220, 160, 0.25);
	}

	.family-badge[data-family='data'] {
		background: rgba(255, 200, 120, 0.25);
	}

	.family-badge[data-family='audio'] {
		background: rgba(220, 140, 255, 0.25);
	}

	.buffer-label {
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.family-override {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px 0;
		font-size: 10px;
		flex: 0 0 auto;
	}

	.family-override select {
		font-size: 10px;
		padding: 2px 6px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: #1a1f30;
		color: inherit;
	}
</style>
